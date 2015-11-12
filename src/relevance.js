'use strict';

var lodash = require('lodash');
var merge = lodash.merge;
var values = lodash.values;

const RELEVANCE = {
  WORD_COUNT_TITLE: .3,
  SIMILAR_TITLE: .2,
  SIMILAR_PRICE: .5
};

function wordCount (sentence) {
  return sentence.split(' ').length;
}

function getWords (sentence) {
  return sentence.split(' ').map(word => word.toLowerCase());
}

function diffWords (diffFrom, diffThis) {
  return diffFrom.filter(elem => {
    return diffThis.indexOf(elem) === -1;
  });
}

function findDifferentWords (sentenceA, sentenceB) {
  const wordsA = getWords(sentenceA);
  const wordsB = getWords(sentenceB);
  const diffFrom = wordsA.length > wordsB.length ? wordsA : wordsB;
  const diffThis = diffFrom === wordsA ? wordsB : wordsA;
  const differentWords = diffWords(diffFrom, diffThis);

  return (differentWords.length > 10 ? 10 : differentWords.length);
}

/**
  baseProductScraped : {
    <sellerKey> : {
      title: ...,
      price: ...,
      image: ...
    }
  }
*/
function findRelevant (baseProductScraped, potentialMatchesScraped) {
  // check for -
  // . word count in title
  // . similar words in title
  // . similarity in price
  // . ?
  // score each potential match based on such factors and return a score

  const baseProduct = values(baseProductScraped)[0];
  const potentialMatches = potentialMatchesScraped.map(potentialMatchScraped => {
    return values(potentialMatchScraped)[0];
  });

  const baseTitle = baseProduct.title;
  const basePrice = baseProduct.price;

  const baseTitleWordCount = wordCount(baseTitle);

  const matchScores = potentialMatches.map(potentialMatch => {
    const title = potentialMatch.title;
    const price = potentialMatch.price;

    const titleWordCount = wordCount(title);
    const wordCountScore = (1- Math.abs((titleWordCount - baseTitleWordCount) / 100)) * RELEVANCE.WORD_COUNT_TITLE;

    // assumes that the number of different words b/w 2 titles will be <= 10
    // amplifies each mismatch by 10.
    const similarTitleScore = (1- (findDifferentWords(baseTitle, title) * 10 / 100)) * RELEVANCE.SIMILAR_TITLE;

    const similarPriceScore = (1- Math.abs((basePrice - price) / basePrice)) * RELEVANCE.SIMILAR_PRICE;

    // console.log({title, wordCountScore, similarTitleScore, similarPriceScore});
    return merge(potentialMatch, {score: wordCountScore + similarTitleScore + similarPriceScore});
  });

  const sortedMatches = matchScores.sort((a, b)  => {
    return a.score < b.score;
  });

  console.log(sortedMatches);

  if (sortedMatches.length && sortedMatches[0].score >= 0.8) {
    return {[sortedMatches[0].site]: sortedMatches[0]};
  }

  return;
}

module.exports = {
  findRelevant
};
