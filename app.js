'use strict';

var Promise = require('bluebird');
var request = require('superagent');
let express = require('express');
let app = express();
let cheerio = require('cheerio');
let _ = require('lodash');

var relevance = require('./src/relevance');
var config = require('./src/config');
var SITES = config.SITES;

const baseURL = 'http://localhost:6100/scrape';
const userAgentString = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_10_1) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/40.0.2214.94 Safari/537.36';

function getSite (url) {
  if (url.indexOf('flipkart.com') !== -1) {
    return SITES.FLIPKART;
  }
  else if (url.indexOf('snapdeal.com') !== -1) {
    return SITES.SNAPDEAL;
  }
  else if (url.indexOf('amazon.in') !== -1) {
    return SITES.AMAZON;
  }
  return;
}

function getOtherSites (site) {
  var siteNames = _.values(SITES);
  return siteNames.filter(siteName => {
    return site !== siteName;
  });
}

function getSearchURL (props) {
  const site = props.site;
  const title = props.title;
  const queryTitle = encodeURIComponent(title).replace(/%20/g, '+');

  switch (site) {
    case SITES.FLIPKART:
    return (
      `http://www.flipkart.com/search?q=${queryTitle}&count=5`
    );

    case SITES.SNAPDEAL:
    return (
      `http://www.snapdeal.com/search?keyword=${queryTitle}&santizedKeyword=&catId=&categoryId=&suggested=false&vertical=&noOfResults=5&clickSrc=go_header&lastKeyword=&prodCatId=&changeBackToAll=false&foundInAll=false&categoryIdSearched=&cityPageUrl=&url=&utmContent=&dealDetail=`
    );
  }
}

function getPotentialURLs ($, site) {
  let potentialURLs = [];

  switch (site) {
    case SITES.SNAPDEAL:
      $('.products_wrapper .product_grid_row .product-txtWrapper a.prodLink').each((index, item) => {
        potentialURLs.push($(item).attr('href'));
      });
      break;
    case SITES.FLIPKART:
      $('#products .old-grid .product-unit .pu-details .pu-title a').each((index, item) => {
        const href = $(item).attr('href');
        potentialURLs.push(`http://www.flipkart.com${href}`);
      });
      break;
  }

  return potentialURLs;
}

function handleCompare (req, res) {
  const url = req.query.url;
  const requestSite = getSite(url);
  const requestURL = `${baseURL}?url=${url}&site=${requestSite}`;

  new Promise((resolve, reject) => {
    request
    .get(requestURL)
    .set('User-Agent', userAgentString)
    .set('Accept', 'application/json')
    .end((err, response) => {
      if (err) {
        return reject(err);
      }

      const requestURLData = response.body;
      const title = requestURLData[requestSite].title;
      const searchURLs = getOtherSites(requestSite)
        .map(otherSite => getSearchURL({site: otherSite, title}))
        .filter(site => site);

      resolve({searchURLs, requestURLData});
    });
  })
  .then(props => {
    const searchURLs = props.searchURLs;
    const requestURLData = props.requestURLData;

    return Promise.all(searchURLs.map(searchURL => {
      return new Promise((resolve, reject) => {
        request
        .get(searchURL)
        .set('User-Agent', userAgentString)
        .end((err, searchURLResponse) => {
          if (err) {
            reject (err);
          }

          resolve({searchURL, searchURLResponse});
        });
      })
    }))
    .then(searchURLsResponses => {
      return {searchURLsResponses, requestURLData};
    })
  })
  .then(props => {
    const searchURLsResponses = props.searchURLsResponses;
    const requestURLData = props.requestURLData;

    const potentialURLs = searchURLsResponses
    .map(prop => {
      const searchSite = getSite(prop.searchURL);
      const body = prop.searchURLResponse.text;
      const $ = cheerio.load(body);
      return getPotentialURLs($, searchSite);
    })
    .reduce((flattenedURLs, url) => {
      return flattenedURLs.concat(url);
    }, []);

    return {potentialURLs, requestURLData};
  })
  .then(props => {
    const potentialURLs = props.potentialURLs;
    const requestURLData = props.requestURLData;

    return Promise.all(potentialURLs.map(potentialURL => {
      return new Promise((resolve, reject) => {
        const resultSite = getSite(potentialURL);
        const requestURL = `${baseURL}?url=${potentialURL}&site=${resultSite}`;
        request
        .get(requestURL)
        .end((err, potentialURLResponse) => {
          if (err) {
            reject(err);
          }

          resolve(potentialURLResponse.body);
        });
      });
    }))
    .then(potentialResults => {
      return {potentialResults, requestURLData};
    })
  })
  .then(props => {
    const requestURLData = props.requestURLData;
    const potentialResults = props.potentialResults;
    const relevantResult = relevance.findRelevant(requestURLData, potentialResults);
    res.json(_.merge(requestURLData, relevantResult));
  })
  .catch(error => {
    console.log(error);
    res.json({status: 'error', error});
  })
};

app.get('/compare', handleCompare);
app.listen(6101);
console.log('comparer running on http://localhost:6101. Use route /compare');
