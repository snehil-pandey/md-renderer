/**
 * utils/cache.js
 *
 * In-memory LRU cache for fetched Markdown content.
 *
 * Strategy:
 *  - Key  : the full canonical URL string
 *  - Value: raw Markdown text (string)
 *  - TTL  : 5 minutes per entry (auto-evicted on access after expiry)
 *  - Max entries   : 200
 *  - Max total size: 50 MB (measured in UTF-8 bytes)
 *
 * Using lru-cache v10 which requires the LRUCache named export.
 */

'use strict';

const { LRUCache } = require('lru-cache');

const cache = new LRUCache({
  // Maximum number of distinct cached URLs.
  max: 200,

  // Total byte budget across all cached values.
  maxSize: 50 * 1024 * 1024, // 50 MB

  // lru-cache calls this to determine the "weight" of each entry.
  sizeCalculation: (value) => Buffer.byteLength(value, 'utf8'),

  // Entries older than this are considered stale and re-fetched.
  ttl: 1000 * 60 * 5, // 5 minutes in ms

  // When the TTL expires, treat reads as misses (don't serve stale data).
  allowStale: false,
});

/**
 * Retrieve a cached Markdown string for a URL.
 * Returns undefined if the key is absent or has expired.
 *
 * @param {string} key - Canonical URL string.
 * @returns {string|undefined}
 */
function get(key) {
  return cache.get(key);
}

/**
 * Store a Markdown string in the cache.
 *
 * @param {string} key   - Canonical URL string.
 * @param {string} value - Raw Markdown text.
 */
function set(key, value) {
  cache.set(key, value);
}

/**
 * Check whether a non-expired entry exists for the given key.
 *
 * @param {string} key
 * @returns {boolean}
 */
function has(key) {
  return cache.has(key);
}

/**
 * Expose cache statistics for health / debug endpoints.
 *
 * @returns {{ size: number, calculatedSize: number }}
 */
function stats() {
  return {
    entries: cache.size,
    bytesUsed: cache.calculatedSize,
    maxEntries: 200,
    maxBytes: 50 * 1024 * 1024,
  };
}

module.exports = { get, set, has, stats };
