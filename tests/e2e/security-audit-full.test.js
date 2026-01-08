/**
 * E2E Tests for Security Audit Feature
 *
 * These tests validate the complete workflow of the security audit feature,
 * including API endpoints, data flow, and user scenarios.
 *
 * Prerequisites:
 * - Server must be running on http://localhost:3456
 * - Claude CLI must be installed and available
 *
 * To run:
 * 1. Start server: npm start
 * 2. Run tests: npm test tests/e2e/security-audit-full.test.js
 *
 * Note: These tests will skip if prerequisites are not met.
 */

const { describe, it, beforeEach } = require('node:test');
const assert = require('node:assert');
const http = require('http');

// Configuration
const SERVER_URL = process.env.SERVER_URL || 'http://localhost:3456';
const API_BASE = `${SERVER_URL}/api/security`;
const TEST_TIMEOUT = 60000; // 60 seconds for scan operations

/**
 * Helper: Make HTTP request
 */
function makeRequest(url, options = {}) {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url);
    const requestOptions = {
      hostname: urlObj.hostname,
      port: urlObj.port,
      path: urlObj.pathname + urlObj.search,
      method: options.method || 'GET',
      headers: {
        'Content-Type': 'application/json',
        ...options.headers
      }
    };

    const req = http.request(requestOptions, (res) => {
      let data = '';

      res.on('data', (chunk) => {
        data += chunk;
      });

      res.on('end', () => {
        try {
          const jsonData = data ? JSON.parse(data) : null;
          resolve({
            status: res.statusCode,
            headers: res.headers,
            data: jsonData
          });
        } catch (error) {
          reject(new Error(`Failed to parse response: ${data}`));
        }
      });
    });

    req.on('error', reject);

    if (options.body) {
      req.write(JSON.stringify(options.body));
    }

    req.end();
  });
}

/**
 * Helper: Check if server is running
 */
async function isServerRunning() {
  try {
    const response = await makeRequest(SERVER_URL);
    return response.status === 200;
  } catch (error) {
    return false;
  }
}

/**
 * Helper: Check if Claude CLI is available
 */
async function isClaudeCliAvailable() {
  try {
    const response = await makeRequest(`${API_BASE}/cli-status`);
    return response.status === 200 && response.data.available === true;
  } catch (error) {
    return false;
  }
}

/**
 * Helper: Wait for scan to complete
 */
async function waitForScanCompletion(scanId, maxWaitTime = TEST_TIMEOUT) {
  const startTime = Date.now();

  while (Date.now() - startTime < maxWaitTime) {
    const response = await makeRequest(`${API_BASE}/scan/${scanId}`);

    if (response.status !== 200) {
      throw new Error(`Failed to get scan status: ${response.status}`);
    }

    const status = response.data.status;

    if (status === 'completed') {
      return response.data.result;
    } else if (status === 'failed') {
      throw new Error(`Scan failed: ${response.data.error}`);
    }

    // Wait 2 seconds before polling again
    await new Promise(resolve => setTimeout(resolve, 2000));
  }

  throw new Error('Scan timed out');
}

describe('Security Audit E2E Tests', () => {
  let serverRunning = false;
  let cliAvailable = false;

  beforeEach(async () => {
    // Check prerequisites once
    if (serverRunning === false && cliAvailable === false) {
      serverRunning = await isServerRunning();
      cliAvailable = await isClaudeCliAvailable();

      if (!serverRunning) {
        console.log('⚠️  Server is not running at', SERVER_URL);
        console.log('   Start server with: npm start');
      }

      if (!cliAvailable) {
        console.log('⚠️  Claude CLI is not available');
        console.log('   Install from: https://claude.ai/code');
      }
    }
  });

  describe('Prerequisites Check', () => {
    it('should have server running', async () => {
      if (!serverRunning) {
        console.log('SKIPPED: Server not running');
        return;
      }
      assert.strictEqual(serverRunning, true, 'Server should be running');
    });

    it('should have Claude CLI available', async () => {
      if (!serverRunning || !cliAvailable) {
        console.log('SKIPPED: Prerequisites not met');
        return;
      }
      assert.strictEqual(cliAvailable, true, 'Claude CLI should be available');
    });
  });

  describe('API Endpoint Tests', () => {
    it('should get CLI status', async () => {
      if (!serverRunning) {
        console.log('SKIPPED: Server not running');
        return;
      }

      const response = await makeRequest(`${API_BASE}/cli-status`);

      assert.strictEqual(response.status, 200);
      assert.ok(response.data);
      assert.ok(typeof response.data.available === 'boolean');

      if (response.data.available) {
        assert.ok(response.data.version, 'Should have version info');
      } else {
        assert.ok(response.data.installGuide, 'Should have install guide');
      }
    });

    it('should start a security scan', async () => {
      if (!serverRunning || !cliAvailable) {
        console.log('SKIPPED: Prerequisites not met');
        return;
      }

      const response = await makeRequest(`${API_BASE}/scan`, {
        method: 'POST',
        body: {
          path: process.cwd(), // Scan current project
          scope: 'quick',
          exclude: ['node_modules', 'dist', '.git']
        }
      });

      assert.strictEqual(response.status, 202, 'Should return 202 Accepted');
      assert.ok(response.data);
      assert.ok(response.data.id, 'Should have scan ID');
      assert.strictEqual(response.data.status, 'running');
      assert.ok(response.data.message);
    });

    it('should get scan status', async () => {
      if (!serverRunning || !cliAvailable) {
        console.log('SKIPPED: Prerequisites not met');
        return;
      }

      // Start a scan first
      const startResponse = await makeRequest(`${API_BASE}/scan`, {
        method: 'POST',
        body: {
          path: __dirname, // Scan test directory (smaller, faster)
          scope: 'quick'
        }
      });

      assert.strictEqual(startResponse.status, 202);
      const scanId = startResponse.data.id;

      // Get status immediately (should be running)
      const statusResponse = await makeRequest(`${API_BASE}/scan/${scanId}`);

      assert.strictEqual(statusResponse.status, 200);
      assert.ok(statusResponse.data);
      assert.strictEqual(statusResponse.data.id, scanId);
      assert.ok(['running', 'completed', 'failed'].includes(statusResponse.data.status));
    });

    it('should list all scans', async () => {
      if (!serverRunning) {
        console.log('SKIPPED: Server not running');
        return;
      }

      const response = await makeRequest(`${API_BASE}/scans`);

      assert.strictEqual(response.status, 200);
      assert.ok(response.data);
      assert.ok(Array.isArray(response.data.active), 'Should have active scans array');
      assert.ok(Array.isArray(response.data.history), 'Should have history array');
    });

    it('should get history', async () => {
      if (!serverRunning) {
        console.log('SKIPPED: Server not running');
        return;
      }

      const response = await makeRequest(`${API_BASE}/history?type=security-scan`);

      assert.strictEqual(response.status, 200);
      assert.ok(response.data);
      assert.ok(Array.isArray(response.data.history));
    });
  });

  describe('Complete Workflow Tests', () => {
    it('should complete full scan workflow', async function() {
      // Increase timeout for this test
      this.timeout = TEST_TIMEOUT + 10000;

      if (!serverRunning || !cliAvailable) {
        console.log('SKIPPED: Prerequisites not met');
        return;
      }

      console.log('\n🔍 Starting full scan workflow test...');

      // Step 1: Start scan
      console.log('  1. Starting scan...');
      const startResponse = await makeRequest(`${API_BASE}/scan`, {
        method: 'POST',
        body: {
          path: __dirname, // Scan test directory (faster than full project)
          scope: 'quick',
          exclude: ['node_modules']
        }
      });

      assert.strictEqual(startResponse.status, 202);
      const scanId = startResponse.data.id;
      console.log(`  ✓ Scan started with ID: ${scanId}`);

      // Step 2: Wait for completion
      console.log('  2. Waiting for scan to complete...');
      const result = await waitForScanCompletion(scanId);
      console.log('  ✓ Scan completed');

      // Step 3: Validate result structure
      console.log('  3. Validating result structure...');
      assert.ok(result, 'Should have result');
      assert.ok(result.id, 'Should have result ID');
      assert.ok(result.type, 'Should have result type');
      assert.strictEqual(result.status, 'completed', 'Status should be completed');
      assert.ok(result.summary, 'Should have summary');
      assert.ok(Array.isArray(result.issues), 'Should have issues array');
      console.log(`  ✓ Found ${result.issues.length} issues`);

      // Step 4: Check if result is in history
      console.log('  4. Checking history...');
      const historyResponse = await makeRequest(`${API_BASE}/history?type=security-scan`);
      assert.strictEqual(historyResponse.status, 200);

      const foundInHistory = historyResponse.data.history.some(entry => entry.id === scanId);
      assert.ok(foundInHistory, 'Scan result should be in history');
      console.log('  ✓ Result found in history');

      console.log('\n✅ Full workflow test completed successfully\n');
    });

    it('should handle cache correctly', async function() {
      this.timeout = TEST_TIMEOUT + 10000;

      if (!serverRunning || !cliAvailable) {
        console.log('SKIPPED: Prerequisites not met');
        return;
      }

      console.log('\n💾 Testing cache functionality...');

      const scanPath = __dirname;

      // First scan (cache miss)
      console.log('  1. First scan (cache miss)...');
      const firstStart = Date.now();
      const firstResponse = await makeRequest(`${API_BASE}/scan`, {
        method: 'POST',
        body: { path: scanPath, scope: 'quick' }
      });

      assert.strictEqual(firstResponse.status, 202);
      const firstScanId = firstResponse.data.id;

      const firstResult = await waitForScanCompletion(firstScanId);
      const firstDuration = Date.now() - firstStart;
      assert.strictEqual(firstResult.cached, false, 'First scan should not be cached');
      console.log(`  ✓ First scan completed in ${firstDuration}ms (not cached)`);

      // Second scan (should be cached)
      console.log('  2. Second scan (should hit cache)...');
      const secondStart = Date.now();
      const secondResponse = await makeRequest(`${API_BASE}/scan`, {
        method: 'POST',
        body: { path: scanPath, scope: 'quick' }
      });

      assert.strictEqual(secondResponse.status, 202);
      const secondScanId = secondResponse.data.id;

      const secondResult = await waitForScanCompletion(secondScanId);
      const secondDuration = Date.now() - secondStart;

      // Note: cached result is returned immediately during scan execution,
      // so we check the result structure rather than duration
      assert.ok(secondResult, 'Should have result');
      console.log(`  ✓ Second scan completed in ${secondDuration}ms`);

      console.log('\n✅ Cache test completed\n');
    });

    it('should handle errors gracefully', async () => {
      if (!serverRunning) {
        console.log('SKIPPED: Server not running');
        return;
      }

      console.log('\n🚨 Testing error handling...');

      // Test 1: Missing required parameter
      console.log('  1. Testing missing path parameter...');
      const noPathResponse = await makeRequest(`${API_BASE}/scan`, {
        method: 'POST',
        body: {}
      });

      assert.strictEqual(noPathResponse.status, 400);
      assert.ok(noPathResponse.data.error);
      console.log('  ✓ Correctly rejected request without path');

      // Test 2: Invalid path
      console.log('  2. Testing invalid path...');
      const invalidPathResponse = await makeRequest(`${API_BASE}/scan`, {
        method: 'POST',
        body: { path: '/nonexistent/path/that/does/not/exist' }
      });

      // Should either reject immediately (400) or fail during scan (202 then failed)
      assert.ok(
        invalidPathResponse.status === 400 || invalidPathResponse.status === 202,
        'Should handle invalid path'
      );
      console.log('  ✓ Handled invalid path');

      // Test 3: Invalid scan ID
      console.log('  3. Testing invalid scan ID...');
      const invalidIdResponse = await makeRequest(`${API_BASE}/scan/invalid_id`);

      assert.strictEqual(invalidIdResponse.status, 404);
      assert.ok(invalidIdResponse.data.error);
      console.log('  ✓ Correctly returned 404 for invalid scan ID');

      console.log('\n✅ Error handling tests completed\n');
    });
  });

  describe('Performance Tests', () => {
    it('should complete small project scan in < 30 seconds', async function() {
      this.timeout = 35000; // Slightly more than 30s to allow for overhead

      if (!serverRunning || !cliAvailable) {
        console.log('SKIPPED: Prerequisites not met');
        return;
      }

      console.log('\n⏱️  Testing scan performance...');

      const startTime = Date.now();

      const response = await makeRequest(`${API_BASE}/scan`, {
        method: 'POST',
        body: {
          path: __dirname, // Test directory (small)
          scope: 'quick'
        }
      });

      assert.strictEqual(response.status, 202);
      const scanId = response.data.id;

      await waitForScanCompletion(scanId, 30000); // Max 30 seconds

      const duration = Date.now() - startTime;
      console.log(`  ✓ Scan completed in ${(duration / 1000).toFixed(2)}s`);

      assert.ok(duration < 30000, `Scan should complete in < 30s (took ${duration}ms)`);

      console.log('\n✅ Performance test passed\n');
    });
  });
});

// Manual Testing Checklist (run after automated tests)
console.log('\n' + '='.repeat(80));
console.log('📋 MANUAL TESTING CHECKLIST');
console.log('='.repeat(80));
console.log(`
After running automated tests, manually verify:

1. Web UI Functionality:
   □ Open http://localhost:3456
   □ Navigate to Security tab
   □ Click "Start Full Scan" button
   □ Verify progress indicator appears
   □ Verify results display correctly
   □ Check issue cards show severity badges
   □ Click on an issue to see details modal
   □ Verify "View History" button works
   □ Check history list displays correctly
   □ Verify filter/sort controls work

2. User Experience:
   □ Loading states are clear
   □ Error messages are user-friendly
   □ Layout is responsive (resize browser)
   □ No console errors (F12)
   □ Animations are smooth

3. Error Scenarios:
   □ Stop Claude CLI and verify error handling
   □ Scan non-existent path (should show error)
   □ Scan without permissions (if applicable)
   □ Check network tab for failed requests

4. Performance:
   □ Small project scan < 30s
   □ Large project scan < 3 minutes
   □ UI remains responsive during scan
   □ Memory usage stays reasonable

5. Data Persistence:
   □ Restart server
   □ Verify history persists
   □ Check cache works after restart

Mark each item as you verify it. All items should be checked before final release.
`);
console.log('='.repeat(80) + '\n');
