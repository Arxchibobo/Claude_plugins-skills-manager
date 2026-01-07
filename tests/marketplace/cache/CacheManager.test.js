const assert = require('assert');
const fs = require('fs');
const path = require('path');
const os = require('os');
const CacheManager = require('../../../lib/marketplace/cache/CacheManager');

/**
 * CacheManager Unit Tests
 *
 * Tests cover:
 * - Basic cache operations (get, set, has)
 * - TTL expiration behavior
 * - ETag support
 * - Disk persistence
 * - Atomic writes
 * - Cache invalidation
 */

// Helper function to create temporary cache file
function createTempCachePath() {
  return path.join(os.tmpdir(), `test-cache-${Date.now()}-${Math.random().toString(36).substring(7)}.json`);
}

// Helper function to wait for async operations
function wait(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Test Suite
async function runTests() {
  console.log('\n=== CacheManager Unit Tests ===\n');

  let testsRun = 0;
  let testsPassed = 0;
  let testsFailed = 0;

  // Test helper
  async function test(name, fn) {
    testsRun++;
    try {
      await fn();
      testsPassed++;
      console.log(`✓ ${name}`);
    } catch (error) {
      testsFailed++;
      console.error(`✗ ${name}`);
      console.error(`  Error: ${error.message}`);
      console.error(`  Stack: ${error.stack}`);
    }
  }

  // Test 1: Basic set and get
  await test('should store and retrieve values', () => {
    const cache = new CacheManager({ storePath: createTempCachePath() });
    cache.set('key1', 'value1');
    assert.strictEqual(cache.get('key1'), 'value1');
  });

  // Test 2: has() method
  await test('should check if key exists', () => {
    const cache = new CacheManager({ storePath: createTempCachePath() });
    cache.set('key1', 'value1');
    assert.strictEqual(cache.has('key1'), true);
    assert.strictEqual(cache.has('nonexistent'), false);
  });

  // Test 3: ETag storage and retrieval
  await test('should store and retrieve ETag', () => {
    const cache = new CacheManager({ storePath: createTempCachePath() });
    cache.set('key1', 'value1', 'etag-abc123');
    assert.strictEqual(cache.getETag('key1'), 'etag-abc123');
    assert.strictEqual(cache.getETag('nonexistent'), null);
  });

  // Test 4: TTL expiration
  await test('should expire entries after TTL', async () => {
    const cache = new CacheManager({
      storePath: createTempCachePath(),
      ttl: 100 // 100ms TTL for testing
    });

    cache.set('key1', 'value1');
    assert.strictEqual(cache.get('key1'), 'value1');
    assert.strictEqual(cache.isExpired('key1'), false);

    // Wait for TTL to expire
    await wait(150);

    assert.strictEqual(cache.isExpired('key1'), true);
    assert.strictEqual(cache.get('key1'), null); // Should return null when expired
  });

  // Test 5: Cache invalidation
  await test('should invalidate cached entries', () => {
    const cache = new CacheManager({ storePath: createTempCachePath() });
    cache.set('key1', 'value1');
    assert.strictEqual(cache.has('key1'), true);

    cache.invalidate('key1');
    assert.strictEqual(cache.has('key1'), false);
    assert.strictEqual(cache.get('key1'), null);
  });

  // Test 6: Clear all cache
  await test('should clear all cached entries', () => {
    const cache = new CacheManager({ storePath: createTempCachePath() });
    cache.set('key1', 'value1');
    cache.set('key2', 'value2');
    cache.set('key3', 'value3');

    assert.strictEqual(cache.has('key1'), true);
    assert.strictEqual(cache.has('key2'), true);

    cache.clear();

    assert.strictEqual(cache.has('key1'), false);
    assert.strictEqual(cache.has('key2'), false);
    assert.strictEqual(cache.has('key3'), false);
  });

  // Test 7: Cache statistics
  await test('should provide cache statistics', () => {
    const cache = new CacheManager({ storePath: createTempCachePath() });
    cache.set('key1', 'value1');
    cache.set('key2', 'value2');

    const stats = cache.getStats();
    assert.strictEqual(stats.totalEntries, 2);
    assert.strictEqual(stats.validEntries, 2);
    assert.strictEqual(stats.expiredEntries, 0);
    assert.ok(stats.newestEntry > 0);
  });

  // Test 8: Disk persistence - save and load
  await test('should persist cache to disk and reload', async () => {
    const storePath = createTempCachePath();

    // Create cache and add data
    const cache1 = new CacheManager({ storePath });
    cache1.set('key1', 'value1');
    cache1.set('key2', 'value2', 'etag-xyz');

    // Flush to disk immediately
    cache1.flush();

    // Wait a bit for file system
    await wait(50);

    // Verify file exists
    assert.ok(fs.existsSync(storePath), 'Cache file should exist');

    // Create new cache instance with same path (simulates restart)
    const cache2 = new CacheManager({ storePath });

    // Verify data persisted
    assert.strictEqual(cache2.get('key1'), 'value1');
    assert.strictEqual(cache2.get('key2'), 'value2');
    assert.strictEqual(cache2.getETag('key2'), 'etag-xyz');

    // Cleanup
    fs.unlinkSync(storePath);
  });

  // Test 9: Atomic write safety
  await test('should use atomic writes for data safety', async () => {
    const storePath = createTempCachePath();
    const cache = new CacheManager({ storePath });

    cache.set('key1', 'value1');
    cache.flush();

    await wait(50);

    // Verify main file exists and temp file doesn't
    assert.ok(fs.existsSync(storePath), 'Main cache file should exist');
    assert.ok(!fs.existsSync(`${storePath}.tmp`), 'Temp file should not exist after write');

    // Cleanup
    fs.unlinkSync(storePath);
  });

  // Test 10: Handle corrupted cache file
  await test('should handle corrupted cache file gracefully', () => {
    const storePath = createTempCachePath();

    // Write corrupted JSON
    fs.writeFileSync(storePath, '{invalid json}', 'utf8');

    // Should not throw, should start with empty cache
    const cache = new CacheManager({ storePath });
    assert.strictEqual(cache.getStats().totalEntries, 0);

    // Cleanup
    fs.unlinkSync(storePath);
  });

  // Test 11: Property Test - Cache TTL Behavior
  // This validates Requirement 7.1: TTL-based cache behavior
  await test('Property: Cache TTL Behavior (Requirement 7.1)', async () => {
    const ttl = 200; // 200ms
    const cache = new CacheManager({
      storePath: createTempCachePath(),
      ttl
    });

    // Property: For any cached item, if current time < timestamp + TTL,
    // then get() should return the value without making new request

    const testKey = 'test-key';
    const testValue = { data: 'test-value' };

    cache.set(testKey, testValue);

    // Within TTL: should return cached value
    const startTime = Date.now();
    while (Date.now() - startTime < ttl - 50) {
      const retrieved = cache.get(testKey);
      assert.deepStrictEqual(retrieved, testValue, 'Should return cached value within TTL');
      await wait(10);
    }

    // After TTL: should return null
    await wait(100); // Wait for TTL to expire
    const expiredValue = cache.get(testKey);
    assert.strictEqual(expiredValue, null, 'Should return null after TTL expiration');
  });

  // Summary
  console.log('\n=== Test Summary ===');
  console.log(`Total: ${testsRun}`);
  console.log(`Passed: ${testsPassed}`);
  console.log(`Failed: ${testsFailed}`);
  console.log('===================\n');

  // Exit with appropriate code
  process.exit(testsFailed > 0 ? 1 : 0);
}

// Run tests
if (require.main === module) {
  runTests().catch(error => {
    console.error('Test runner failed:', error);
    process.exit(1);
  });
}

module.exports = { runTests };
