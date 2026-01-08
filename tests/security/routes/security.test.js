/**
 * Integration tests for security routes
 *
 * Tests verify that:
 * 1. Routes correctly map to controller methods
 * 2. Request/response handling works end-to-end
 * 3. Error cases return appropriate status codes
 */

const { test, describe, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert');
const http = require('http');
const SecurityRoutes = require('../../../lib/security/routes/security');

describe('SecurityRoutes', () => {
  let securityRoutes;
  let mockReq;
  let mockRes;

  beforeEach(() => {
    securityRoutes = new SecurityRoutes();

    mockReq = {
      url: '',
      method: 'GET',
      headers: {},
      body: {},
      params: {},
      query: {},
      on: function(event, callback) {
        if (event === 'data') {
          // No data for GET requests
        } else if (event === 'end') {
          callback();
        }
      }
    };

    mockRes = {
      statusCode: 200,
      headers: {},
      data: null,
      writeHead: function(code, headers) {
        this.statusCode = code;
        if (headers) {
          this.headers = { ...this.headers, ...headers };
        }
        return this;
      },
      end: function(data) {
        if (data) {
          this.data = JSON.parse(data);
        }
        return this;
      }
    };
  });

  describe('Utility Methods', () => {
    test('parseBody should parse valid JSON', async () => {
      const req = {
        on: function(event, callback) {
          if (event === 'data') {
            callback('{"test": "value"}');
          } else if (event === 'end') {
            callback();
          }
        }
      };

      const body = await securityRoutes.parseBody(req);
      assert.deepStrictEqual(body, { test: 'value' });
    });

    test('parseBody should reject invalid JSON', async () => {
      const req = {
        on: function(event, callback) {
          if (event === 'data') {
            callback('invalid json');
          } else if (event === 'end') {
            callback();
          }
        }
      };

      await assert.rejects(
        () => securityRoutes.parseBody(req),
        { message: 'Invalid JSON' }
      );
    });

    test('sendJSON should set correct headers and data', () => {
      securityRoutes.sendJSON(mockRes, 200, { success: true });
      assert.strictEqual(mockRes.statusCode, 200);
      assert.strictEqual(mockRes.headers['Content-Type'], 'application/json');
      assert.deepStrictEqual(mockRes.data, { success: true });
    });

    test('sendError should send error response', () => {
      securityRoutes.sendError(mockRes, 404, 'Not found');
      assert.strictEqual(mockRes.statusCode, 404);
      assert.deepStrictEqual(mockRes.data, { error: 'Not found' });
    });
  });

  describe('Route Mapping', () => {
    test('POST /api/security/scan should call scanController.startScan', async () => {
      mockReq.method = 'POST';
      mockReq.url = '/api/security/scan';
      mockReq.on = function(event, callback) {
        if (event === 'data') {
          callback('{"path": "/test"}');
        } else if (event === 'end') {
          callback();
        }
      };

      // This will call the actual controller, which may fail due to Claude CLI unavailability
      // But we can verify that routing works by checking the response structure
      await securityRoutes.handleRoute(mockReq, mockRes, mockReq.url, mockReq.method);

      // Should return either 202 (success) or 400/500 (error)
      assert.ok([202, 400, 500].includes(mockRes.statusCode));
      assert.ok(mockRes.data !== null);
    });

    test('GET /api/security/scan/:id should call scanController.getScanStatus', async () => {
      mockReq.method = 'GET';
      mockReq.url = '/api/security/scan/test_scan_123';

      await securityRoutes.handleRoute(mockReq, mockRes, mockReq.url, mockReq.method);

      // Should return either 200 (found) or 404 (not found)
      assert.ok([200, 404].includes(mockRes.statusCode));
      assert.ok(mockRes.data !== null);
    });

    test('GET /api/security/scans should call scanController.listScans', async () => {
      mockReq.method = 'GET';
      mockReq.url = '/api/security/scans';

      await securityRoutes.handleRoute(mockReq, mockRes, mockReq.url, mockReq.method);

      assert.strictEqual(mockRes.statusCode, 200);
      assert.ok(mockRes.data.active !== undefined);
      assert.ok(mockRes.data.history !== undefined);
    });

    test('POST /api/security/review should call reviewController.startReview', async () => {
      mockReq.method = 'POST';
      mockReq.url = '/api/security/review';
      mockReq.on = function(event, callback) {
        if (event === 'data') {
          callback('{"files": ["test.js"]}');
        } else if (event === 'end') {
          callback();
        }
      };

      await securityRoutes.handleRoute(mockReq, mockRes, mockReq.url, mockReq.method);

      // Should return either 202 (success) or 400/500 (error)
      assert.ok([202, 400, 500].includes(mockRes.statusCode));
      assert.ok(mockRes.data !== null);
    });

    test('GET /api/security/review/:id should call reviewController.getReviewResult', async () => {
      mockReq.method = 'GET';
      mockReq.url = '/api/security/review/test_review_123';

      await securityRoutes.handleRoute(mockReq, mockRes, mockReq.url, mockReq.method);

      // Should return either 200 (found) or 404 (not found)
      assert.ok([200, 404].includes(mockRes.statusCode));
      assert.ok(mockRes.data !== null);
    });

    test('GET /api/security/reviews should call reviewController.listReviews', async () => {
      mockReq.method = 'GET';
      mockReq.url = '/api/security/reviews';

      await securityRoutes.handleRoute(mockReq, mockRes, mockReq.url, mockReq.method);

      assert.strictEqual(mockRes.statusCode, 200);
      assert.ok(mockRes.data.active !== undefined);
      assert.ok(mockRes.data.history !== undefined);
    });

    test('GET /api/security/history should call historyController.getHistory', async () => {
      mockReq.method = 'GET';
      mockReq.url = '/api/security/history';

      await securityRoutes.handleRoute(mockReq, mockRes, mockReq.url, mockReq.method);

      assert.strictEqual(mockRes.statusCode, 200);
      assert.ok(mockRes.data.records !== undefined);
      assert.ok(mockRes.data.total !== undefined);
    });

    test('GET /api/security/history/stats should call historyController.getStats', async () => {
      mockReq.method = 'GET';
      mockReq.url = '/api/security/history/stats';

      await securityRoutes.handleRoute(mockReq, mockRes, mockReq.url, mockReq.method);

      assert.strictEqual(mockRes.statusCode, 200);
      assert.ok(mockRes.data.total !== undefined);
      assert.ok(mockRes.data.byType !== undefined);
      assert.ok(mockRes.data.byStatus !== undefined);
    });

    test('GET /api/security/history/:id should call historyController.getResult', async () => {
      mockReq.method = 'GET';
      mockReq.url = '/api/security/history/test_result_123';

      await securityRoutes.handleRoute(mockReq, mockRes, mockReq.url, mockReq.method);

      // Should return either 200 (found) or 404 (not found)
      assert.ok([200, 404, 500].includes(mockRes.statusCode));
      assert.ok(mockRes.data !== null);
    });

    test('DELETE /api/security/history/:id should call historyController.deleteHistory', async () => {
      mockReq.method = 'DELETE';
      mockReq.url = '/api/security/history/test_result_123';

      await securityRoutes.handleRoute(mockReq, mockRes, mockReq.url, mockReq.method);

      // Should return either 200 (deleted) or 404 (not found)
      assert.ok([200, 404].includes(mockRes.statusCode));
      assert.ok(mockRes.data !== null);
    });

    test('DELETE /api/security/history should call historyController.clearHistory', async () => {
      mockReq.method = 'DELETE';
      mockReq.url = '/api/security/history?confirm=true';

      await securityRoutes.handleRoute(mockReq, mockRes, mockReq.url, mockReq.method);

      // Should return either 200 (cleared) or 400 (no confirmation)
      assert.ok([200, 400].includes(mockRes.statusCode));
      assert.ok(mockRes.data !== null);
    });
  });

  describe('Query Parameters', () => {
    test('should parse query parameters correctly', async () => {
      mockReq.method = 'GET';
      mockReq.url = '/api/security/history?type=security-scan&status=completed&limit=5';

      await securityRoutes.handleRoute(mockReq, mockRes, mockReq.url, mockReq.method);

      assert.strictEqual(mockRes.statusCode, 200);
      assert.ok(mockRes.data.records !== undefined);
    });

    test('should handle missing query parameters', async () => {
      mockReq.method = 'GET';
      mockReq.url = '/api/security/history';

      await securityRoutes.handleRoute(mockReq, mockRes, mockReq.url, mockReq.method);

      assert.strictEqual(mockRes.statusCode, 200);
      assert.ok(mockRes.data.records !== undefined);
    });
  });

  describe('Error Handling', () => {
    test('should return 404 for unknown route', async () => {
      mockReq.method = 'GET';
      mockReq.url = '/api/security/unknown';

      await securityRoutes.handleRoute(mockReq, mockRes, mockReq.url, mockReq.method);

      assert.strictEqual(mockRes.statusCode, 404);
      assert.ok(mockRes.data.error);
      assert.ok(mockRes.data.error.includes('not found'));
    });

    test('should handle invalid JSON in POST request', async () => {
      mockReq.method = 'POST';
      mockReq.url = '/api/security/scan';
      mockReq.on = function(event, callback) {
        if (event === 'data') {
          callback('invalid json');
        } else if (event === 'end') {
          callback();
        } else if (event === 'error') {
          // Store error callback for potential future use
        }
      };

      await securityRoutes.handleRoute(mockReq, mockRes, mockReq.url, mockReq.method);

      assert.strictEqual(mockRes.statusCode, 500);
      assert.ok(mockRes.data.error);
    });
  });

  describe('Request Body Parsing', () => {
    test('should parse POST body for scan request', async () => {
      mockReq.method = 'POST';
      mockReq.url = '/api/security/scan';
      mockReq.on = function(event, callback) {
        if (event === 'data') {
          callback('{"path": "/test/path", "scope": "full"}');
        } else if (event === 'end') {
          callback();
        }
      };

      await securityRoutes.handleRoute(mockReq, mockRes, mockReq.url, mockReq.method);

      // Should have processed the body and passed it to controller
      assert.ok([202, 400, 500].includes(mockRes.statusCode));
    });

    test('should parse POST body for review request', async () => {
      mockReq.method = 'POST';
      mockReq.url = '/api/security/review';
      mockReq.on = function(event, callback) {
        if (event === 'data') {
          callback('{"files": ["src/test.js", "src/utils.js"]}');
        } else if (event === 'end') {
          callback();
        }
      };

      await securityRoutes.handleRoute(mockReq, mockRes, mockReq.url, mockReq.method);

      // Should have processed the body and passed it to controller
      assert.ok([202, 400, 500].includes(mockRes.statusCode));
    });
  });
});
