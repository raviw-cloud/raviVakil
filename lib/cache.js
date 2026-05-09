'use strict';

const reportCache = new Map();
const CACHE_MAX   = 50;

function cacheSet(sessionId, data) {
  reportCache.set(sessionId, data);
  if (reportCache.size > CACHE_MAX) {
    reportCache.delete(reportCache.keys().next().value);
  }
}

function cacheGet(sessionId) {
  return reportCache.get(sessionId);
}

module.exports = { cacheGet, cacheSet };
