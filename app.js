'use strict';

var Promise = require('bluebird');
var request = require('superagent');
let express = require('express');
let app = express();
let cheerio = require('cheerio');
let lodash = require('lodash');
let merge = lodash.merge;

var relevance = require('./src/relevance');

const baseURL = 'http://localhost:6100/scrape';

function getSite (url) {
  if (url.indexOf('flipkart.com') !== -1) {
    return 'flipkart';
  }
  else if (url.indexOf('snapdeal.com') !== -1) {
    return 'snapdeal';
  }
  return;
}

const userAgentString = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_10_1) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/40.0.2214.94 Safari/537.36';

function handleCompare (req, res) {
  const url = req.query.url;
  const site = getSite(url);
  const requestURL = `${baseURL}?url=${url}&site=${site}`;

  new Promise((resolve, reject) => {
    request
    .get(requestURL)
    .set('User-Agent', userAgentString)
    .set('Accept', 'application/json')
    .end((err, response) => {
      if (err) {
        return reject(err);
      }

      const siteData = response.body;
      const title = siteData[site].title;
      const queryTitle = encodeURIComponent(title).replace(/%20/g, '+');

      const snapdealSearchURL = `http://www.snapdeal.com/search?keyword=${queryTitle}&santizedKeyword=&catId=&categoryId=&suggested=false&vertical=&noOfResults=5&clickSrc=go_header&lastKeyword=&prodCatId=&changeBackToAll=false&foundInAll=false&categoryIdSearched=&cityPageUrl=&url=&utmContent=&dealDetail=`;
      resolve({snapdealSearchURL, siteData});
    });
  })
  .then(props => {
    const searchURL = props.snapdealSearchURL;
    const siteData = props.siteData;

    return new Promise((resolve, reject) => {
      request
      .get(searchURL)
      .set('User-Agent', userAgentString)
      .end((err, response) => {
        if (err) {
          reject (err);
        }

        resolve({response, siteData});
      });
    })
  })
  .then(props => {
    const response = props.response;
    const siteData = props.siteData;

    const body = response.text;
    const $ = cheerio.load(body);
    const potentialURLs = [];

    // this is specific to Snapdeal Search Results
    $('.products_wrapper .product_grid_row .product-txtWrapper a.prodLink').each((index, item) => {
      potentialURLs.push($(item).attr('href'));
    });

    return {potentialURLs, siteData};
  })
  .then(props => {
    const potentialURLs = props.potentialURLs;
    const siteData = props.siteData;

    return Promise.all(potentialURLs.map(potentialURL => {
      return new Promise((resolve, reject) => {
        const resultSite = getSite(potentialURL);
        const requestURL = `${baseURL}?url=${potentialURL}&site=${resultSite}`;
        request
        .get(requestURL)
        .end((err, response) => {
          if (err) {
            reject(err);
          }

          resolve(response.body);
        });
      });
    }))
    .then(responses => {
      return {responses, siteData};
    })
  })
  .then(props => {
    const siteData = props.siteData;
    const responses = props.responses;
    const relevantResult = relevance.findRelevant(siteData.flipkart, responses.map(response => {
      return response['snapdeal'];
    }));
    res.json(merge(siteData, {
      snapdeal: relevantResult
    }));
  })
  .catch(error => {
    console.log(error);
    res.json({status: 'error', error});
  })
};

app.get('/compare', handleCompare);
app.listen(6101);
console.log('comparer running on http://localhost:6101. Use route /compare');
