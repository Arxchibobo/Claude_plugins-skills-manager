const assert = require('assert');
const GitHubAPIProxy = require('../../../lib/marketplace/api/GitHubAPIProxy');
const CacheManager = require('../../../lib/marketplace/cache/CacheManager');
const path = require('path');
const os = require('os');

/**
 * GitHubAPIProxy Unit Tests
 *
 * Tests cover:
 * - Basic API calls (repository search, get repo, releases)
 * - Caching behavior
 * - Rate limit tracking
 * - Authentication headers (PAT)
 * - Error handling
 * - GraphQL batch fetching
 */

// Helper function to create temp cache
function createTempCache() {
  return new CacheManager({
    storePath: path.join(os.tmpdir(), `test-github-cache-${Date.now()}-${Math.random().toString(36).substring(7)}.json`),
    ttl: 60000
  });
}

// Helper to wait
function wait(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Mock HTTP responses
class MockGitHubAPIProxy extends GitHubAPIProxy {
  constructor(config, mockResponses = {}) {
    super(config);
    this.mockResponses = mockResponses;
    this.requestLog = [];
  }

  async _makeHttpRequest(url, options) {
    // Log the request
    this.requestLog.push({ url, options });

    // Find mock response
    const mockKey = `${options.method || 'GET'} ${url}`;
    const mock = this.mockResponses[mockKey] || this.mockResponses['*'];

    if (!mock) {
      throw new Error(`No mock response configured for: ${mockKey}`);
    }

    // Simulate network delay
    await wait(10);

    return mock;
  }
}

// Test Suite
async function runTests() {
  console.log('\n=== GitHubAPIProxy Unit Tests ===\n');

  let testsRun = 0;
  let testsPassed = 0;
  let testsFailed = 0;

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
      if (error.stack) {
        console.error(`  Stack: ${error.stack.split('\n').slice(0, 3).join('\n')}`);
      }
    }
  }

  // Test 1: Constructor and initialization
  await test('should initialize with default configuration', () => {
    const proxy = new GitHubAPIProxy();
    assert.strictEqual(proxy.baseUrl, 'https://api.github.com');
    assert.strictEqual(proxy.graphqlUrl, 'https://api.github.com/graphql');
    assert.strictEqual(proxy.pat, null);
    assert.ok(proxy.cache instanceof CacheManager);
  });

  // Test 2: Constructor with PAT
  await test('should initialize with PAT', () => {
    const proxy = new GitHubAPIProxy({ pat: 'test-token-123' });
    assert.strictEqual(proxy.pat, 'test-token-123');
  });

  // Test 3: Build headers without PAT
  await test('should build headers without authentication', () => {
    const proxy = new GitHubAPIProxy();
    const headers = proxy._buildHeaders();

    assert.ok(headers['User-Agent']);
    assert.ok(headers['Accept']);
    assert.strictEqual(headers['Authorization'], undefined);
  });

  // Test 4: Build headers with PAT
  await test('should build headers with authentication', () => {
    const proxy = new GitHubAPIProxy({ pat: 'test-token-123' });
    const headers = proxy._buildHeaders();

    assert.strictEqual(headers['Authorization'], 'token test-token-123');
  });

  // Test 5: Build headers with ETag
  await test('should include ETag in headers for conditional requests', () => {
    const proxy = new GitHubAPIProxy();
    const headers = proxy._buildHeaders({ etag: '"abc123"' });

    assert.strictEqual(headers['If-None-Match'], '"abc123"');
  });

  // Test 6: Cache key generation
  await test('should generate cache keys correctly', () => {
    const proxyNoAuth = new GitHubAPIProxy();
    const proxyWithAuth = new GitHubAPIProxy({ pat: 'test-token' });

    const key1 = proxyNoAuth._getCacheKey('/repos/owner/repo');
    const key2 = proxyWithAuth._getCacheKey('/repos/owner/repo');

    assert.ok(key1.includes('noauth'));
    assert.ok(key2.includes('auth'));
    assert.notStrictEqual(key1, key2);
  });

  // Test 7: Mock repository search
  await test('should search repositories by topic', async () => {
    const mockResponse = {
      statusCode: 200,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        items: [
          { id: 1, name: 'test-repo', stargazers_count: 100 }
        ]
      })
    };

    const proxy = new MockGitHubAPIProxy(
      { cache: createTempCache() },
      { '*': mockResponse }
    );

    const results = await proxy.searchRepositories('claude-code-plugin');

    assert.ok(Array.isArray(results));
    assert.strictEqual(results.length, 1);
    assert.strictEqual(results[0].name, 'test-repo');
  });

  // Test 8: Mock get repository
  await test('should get repository details', async () => {
    const mockResponse = {
      statusCode: 200,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        name: 'test-repo',
        owner: { login: 'test-owner' },
        stargazers_count: 150
      })
    };

    const proxy = new MockGitHubAPIProxy(
      { cache: createTempCache() },
      { '*': mockResponse }
    );

    const repo = await proxy.getRepository('test-owner', 'test-repo');

    assert.strictEqual(repo.name, 'test-repo');
    assert.strictEqual(repo.owner.login, 'test-owner');
    assert.strictEqual(repo.stargazers_count, 150);
  });

  // Test 9: Caching behavior
  await test('should cache successful responses', async () => {
    const mockResponse = {
      statusCode: 200,
      headers: {
        'etag': '"test-etag"',
        'content-type': 'application/json'
      },
      body: JSON.stringify({ data: 'test-data' })
    };

    const cache = createTempCache();
    const proxy = new MockGitHubAPIProxy({ cache }, { '*': mockResponse });

    // First call - should make HTTP request
    const result1 = await proxy._request('/test-endpoint');
    assert.strictEqual(proxy.requestLog.length, 1);

    // Second call - should use cache
    const result2 = await proxy._request('/test-endpoint');
    assert.strictEqual(proxy.requestLog.length, 1); // No new request

    assert.deepStrictEqual(result1, result2);
  });

  // Test 10: Rate limit tracking from headers
  await test('should update rate limit from response headers', () => {
    const proxy = new GitHubAPIProxy();

    const headers = {
      'x-ratelimit-limit': '5000',
      'x-ratelimit-remaining': '4999',
      'x-ratelimit-reset': `${Math.floor(Date.now() / 1000) + 3600}`
    };

    proxy._updateRateLimitFromHeaders(headers);

    assert.strictEqual(proxy.rateLimit.limit, 5000);
    assert.strictEqual(proxy.rateLimit.remaining, 4999);
    assert.ok(proxy.rateLimit.resetDate instanceof Date);
  });

  // Test 11: Handle rate limit exceeded
  await test('should throw error when rate limit exceeded', () => {
    const proxy = new GitHubAPIProxy();
    proxy.rateLimit.resetDate = new Date(Date.now() + 60000); // 1 minute from now

    const response = {
      statusCode: 403,
      body: { message: 'API rate limit exceeded' }
    };

    try {
      proxy._handleRateLimit(response);
      assert.fail('Should have thrown error');
    } catch (error) {
      assert.ok(error.message.includes('Rate limit exceeded'));
      assert.ok(error.message.includes('minute'));
    }
  });

  // Test 12: GraphQL query builder
  await test('should build GraphQL query for batch fetch', () => {
    const proxy = new GitHubAPIProxy();
    const repoIds = ['owner1/repo1', 'owner2/repo2'];

    const query = proxy._buildGraphQLQuery(repoIds);

    assert.ok(query.includes('repo0'));
    assert.ok(query.includes('repo1'));
    assert.ok(query.includes('owner1'));
    assert.ok(query.includes('owner2'));
    assert.ok(query.includes('stargazerCount'));
  });

  // Test 13: Parse GraphQL response
  await test('should parse GraphQL response correctly', () => {
    const proxy = new GitHubAPIProxy();

    const mockData = {
      repo0: {
        name: 'test-repo-1',
        owner: { login: 'owner1' },
        description: 'Test description',
        stargazerCount: 100,
        updatedAt: '2024-01-01T00:00:00Z',
        latestRelease: { tagName: 'v1.0.0' }
      }
    };

    const results = proxy._parseGraphQLResponse(mockData, ['owner1/test-repo-1']);

    assert.strictEqual(results.length, 1);
    assert.strictEqual(results[0].name, 'test-repo-1');
    assert.strictEqual(results[0].stars, 100);
    assert.strictEqual(results[0].latestRelease, 'v1.0.0');
  });

  // Test 14: Property Test - PAT Authorization Header (Validates Requirement 10.2)
  await test('Property: PAT Authorization Header (Requirement 10.2)', () => {
    const testToken = 'ghp_test1234567890';
    const proxy = new GitHubAPIProxy({ pat: testToken });

    // Property: For any request when PAT is configured,
    // headers SHALL include Authorization: token {PAT}
    const headers = proxy._buildHeaders();

    assert.strictEqual(
      headers['Authorization'],
      `token ${testToken}`,
      'Authorization header must match "token {PAT}" format'
    );

    // Test with different PAT
    const proxy2 = new GitHubAPIProxy({ pat: 'different-token-xyz' });
    const headers2 = proxy2._buildHeaders();

    assert.strictEqual(
      headers2['Authorization'],
      'token different-token-xyz',
      'Authorization must use the configured PAT'
    );
  });

  // Test 15: Proxy configuration from environment
  await test('should read proxy configuration from environment variables', () => {
    // Save original env
    const originalHttpsProxy = process.env.HTTPS_PROXY;

    // Set test proxy
    process.env.HTTPS_PROXY = 'http://proxy.example.com:8080';

    const proxy = new GitHubAPIProxy();

    assert.ok(proxy.proxy);
    assert.strictEqual(proxy.proxy.host, 'proxy.example.com');
    assert.strictEqual(proxy.proxy.port, '8080');

    // Restore env
    if (originalHttpsProxy) {
      process.env.HTTPS_PROXY = originalHttpsProxy;
    } else {
      delete process.env.HTTPS_PROXY;
    }
  });

  // Test 16: Get latest release
  await test('should get latest release for repository', async () => {
    const mockResponse = {
      statusCode: 200,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        tag_name: 'v1.2.3',
        name: 'Release v1.2.3',
        assets: [
          { name: 'extension.zip', browser_download_url: 'https://github.com/.../extension.zip' }
        ]
      })
    };

    const proxy = new MockGitHubAPIProxy(
      { cache: createTempCache() },
      { '*': mockResponse }
    );

    const release = await proxy.getLatestRelease('test-owner', 'test-repo');

    assert.strictEqual(release.tag_name, 'v1.2.3');
    assert.ok(Array.isArray(release.assets));
    assert.strictEqual(release.assets.length, 1);
  });

  // Test 17: Get release asset (prefer .zip)
  await test('should get release asset and prefer .zip files', async () => {
    const mockResponse = {
      statusCode: 200,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        tag_name: 'v1.0.0',
        assets: [
          { name: 'extension.tar.gz', browser_download_url: 'https://github.com/.../extension.tar.gz' },
          { name: 'extension.zip', browser_download_url: 'https://github.com/.../extension.zip' },
          { name: 'checksums.txt', browser_download_url: 'https://github.com/.../checksums.txt' }
        ]
      })
    };

    const proxy = new MockGitHubAPIProxy(
      { cache: createTempCache() },
      { '*': mockResponse }
    );

    const asset = await proxy.getReleaseAsset('test-owner', 'test-repo', 'v1.0.0');

    assert.strictEqual(asset.name, 'extension.zip');
    assert.ok(asset.browser_download_url.endsWith('.zip'));
  });

  // Test 18: Get release asset fallback when no .zip
  await test('should fallback to first asset when no .zip found', async () => {
    const mockResponse = {
      statusCode: 200,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        tag_name: 'v1.0.0',
        assets: [
          { name: 'extension.tar.gz', browser_download_url: 'https://github.com/.../extension.tar.gz' },
          { name: 'checksums.txt', browser_download_url: 'https://github.com/.../checksums.txt' }
        ]
      })
    };

    const proxy = new MockGitHubAPIProxy(
      { cache: createTempCache() },
      { '*': mockResponse }
    );

    const asset = await proxy.getReleaseAsset('test-owner', 'test-repo', 'v1.0.0');

    assert.strictEqual(asset.name, 'extension.tar.gz');
  });

  // Test 19: Handle no assets in release
  await test('should throw error when release has no assets', async () => {
    const mockResponse = {
      statusCode: 200,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        tag_name: 'v1.0.0',
        assets: []
      })
    };

    const proxy = new MockGitHubAPIProxy(
      { cache: createTempCache() },
      { '*': mockResponse }
    );

    try {
      await proxy.getReleaseAsset('test-owner', 'test-repo', 'v1.0.0');
      assert.fail('Should have thrown error');
    } catch (error) {
      assert.ok(error.message.includes('No assets found'));
    }
  });

  // Summary
  console.log('\n=== Test Summary ===');
  console.log(`Total: ${testsRun}`);
  console.log(`Passed: ${testsPassed}`);
  console.log(`Failed: ${testsFailed}`);
  console.log('===================\n');

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
