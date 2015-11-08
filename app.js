'use strict';

var Promise = require('bluebird');
var request = require('superagent');
let express = require('express');
let app = express();
let cheerio = require('cheerio');
let lodash = require('lodash');
// let async = require('async');

let merge = lodash.merge;

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
      const queryTitle = title.replace(/\s/g, '+');

      const snapdealSearchURL = `http://www.snapdeal.com/search?keyword=${queryTitle}&noOfResults=5`;
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
    const searchResults = [];

    // this is specific to Snapdeal Search Results
    $('.products_wrapper .product_grid_row .product-txtWrapper a.prodLink').each((index, item) => {
      searchResults.push($(item).attr('href'));
    });

    return {searchResults, siteData};
  })
  .then(props => {
    const searchResults = props.searchResults;
    const siteData = props.siteData;

    return Promise.all(searchResults.map(searchURL => {
      return new Promise((resolve, reject) => {
        const requestURL = `${baseURL}?url=${searchURL}&site=snapdeal`;
        request
        .get(requestURL)
        .end((err, response) => {
          if (err) {
            reject(err);
          }

          resolve(response.body);
        });
      })
    }))
    .then(responses => {
      return {responses, siteData};
    })
  })
  .then(props => {
    const siteData = props.siteData;
    const responses = props.responses;
    res.json(merge(siteData, responses));
  })
  .catch(error => {
    console.log(error);
    res.json({status: 'error', error});
  })
};

app.get('/compare', handleCompare);
app.listen(6101);
console.log('comparer running on http://localhost:6101. Use route /compare');
