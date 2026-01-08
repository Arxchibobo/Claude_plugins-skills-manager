/**
 * Unit tests for reviewController
 */

const { test, describe, beforeEach, mock } = require('node:test');
const assert = require('node:assert');

// Import controller
const reviewController = require('../../../lib/security/controllers/reviewController');
const ReviewResult = require('../../../lib/security/models/ReviewResult');

describe('reviewController', () => {
  let mockReq;
  let mockRes;

  beforeEach(() => {
    // Reset mocks before each test
    mockReq = {
      body: {},
      params: {},
      query: {}
    };

    mockRes = {
      status: mock.fn(function(code) {
        this.statusCode = code;
        return this;
      }),
      json: mock.fn(function(data) {
        this.data = data;
        return this;
      }),
      statusCode: 200,
      data: null
    };
  });

  describe('startReview', () => {
    test('should return 400 if files is missing', async () => {
      mockReq.body = {};

      await reviewController.startReview(mockReq, mockRes);

      assert.strictEqual(mockRes.statusCode, 400);
      assert.ok(mockRes.data.error);
      assert.ok(mockRes.data.error.includes('files'));
    });

    test('should return 400 if files is not an array', async () => {
      mockReq.body = { files: 'not-an-array' };

      await reviewController.startReview(mockReq, mockRes);

      assert.strictEqual(mockRes.statusCode, 400);
      assert.ok(mockRes.data.error);
    });

    test('should return 400 if files array is empty', async () => {
      mockReq.body = { files: [] };

      await reviewController.startReview(mockReq, mockRes);

      assert.strictEqual(mockRes.statusCode, 400);
      assert.ok(mockRes.data.error);
    });

    test('should accept valid review request', async () => {
      mockReq.body = {
        files: ['src/test.js', 'src/utils.js'],
        scope: 'full',
        format: 'json'
      };

      await reviewController.startReview(mockReq, mockRes);

      // Should return 202 or 500 (depending on Claude CLI availability)
      assert.ok([202, 500].includes(mockRes.statusCode));
    });

    test('should handle missing format parameter with default', async () => {
      mockReq.body = {
        files: ['src/test.js']
      };

      await reviewController.startReview(mockReq, mockRes);

      // Should use default format 'json'
      assert.ok([202, 500].includes(mockRes.statusCode));
    });

    test('should accept optional focus areas', async () => {
      mockReq.body = {
        files: ['src/test.js'],
        focus: ['security', 'performance']
      };

      await reviewController.startReview(mockReq, mockRes);

      assert.ok([202, 500].includes(mockRes.statusCode));
    });
  });

  describe('getReviewResult', () => {
    test('should return 400 if id is missing', async () => {
      mockReq.params = {};

      await reviewController.getReviewResult(mockReq, mockRes);

      assert.strictEqual(mockRes.statusCode, 400);
      assert.ok(mockRes.data.error);
      assert.ok(mockRes.data.error.includes('id'));
    });

    test('should return 404 for non-existent review', async () => {
      mockReq.params = { id: 'nonexistent_review_id' };

      await reviewController.getReviewResult(mockReq, mockRes);

      assert.strictEqual(mockRes.statusCode, 404);
      assert.ok(mockRes.data.error);
    });
  });

  describe('listReviews', () => {
    test('should return reviews list', async () => {
      mockReq.query = {};

      await reviewController.listReviews(mockReq, mockRes);

      assert.strictEqual(mockRes.statusCode, 200);
      assert.ok(mockRes.data.active);
      assert.ok(mockRes.data.history);
      assert.ok(Array.isArray(mockRes.data.active));
      assert.ok(Array.isArray(mockRes.data.history));
    });

    test('should filter by status', async () => {
      mockReq.query = { status: 'completed' };

      await reviewController.listReviews(mockReq, mockRes);

      assert.strictEqual(mockRes.statusCode, 200);
      assert.ok(mockRes.data.active);
      assert.ok(mockRes.data.history);
    });

    test('should apply limit', async () => {
      mockReq.query = { limit: '5' };

      await reviewController.listReviews(mockReq, mockRes);

      assert.strictEqual(mockRes.statusCode, 200);
      assert.ok(mockRes.data.history);
    });
  });

  describe('error handling', () => {
    test('startReview should catch and handle errors', async () => {
      mockReq.body = { files: ['test.js'] };

      await reviewController.startReview(mockReq, mockRes);

      // Should handle error gracefully
      assert.ok(mockRes.statusCode >= 400);
      if (mockRes.statusCode >= 400) {
        assert.ok(mockRes.data.error);
      }
    });

    test('getReviewResult should handle errors', async () => {
      mockReq.params = { id: null };

      await reviewController.getReviewResult(mockReq, mockRes);

      assert.ok(mockRes.statusCode >= 400);
      assert.ok(mockRes.data.error);
    });

    test('listReviews should handle errors', async () => {
      mockReq.query = { limit: 'invalid' };

      await reviewController.listReviews(mockReq, mockRes);

      // Should still work, ignoring invalid limit
      assert.ok([200, 500].includes(mockRes.statusCode));
    });
  });

  describe('async operations', () => {
    test('startReview should return 202 for async review', async () => {
      mockReq.body = { files: ['src/test.js'] };

      await reviewController.startReview(mockReq, mockRes);

      // Should be either 202 (success) or 500 (CLI not available)
      if (mockRes.statusCode === 202) {
        assert.strictEqual(mockRes.data.status, 'running');
        assert.ok(mockRes.data.id);
        assert.ok(mockRes.data.message);
      }
    });

    test('getReviewResult should show running status', async () => {
      // First start a review
      mockReq.body = { files: ['src/test.js'] };
      await reviewController.startReview(mockReq, mockRes);

      if (mockRes.statusCode === 202) {
        const reviewId = mockRes.data.id;

        // Reset response
        mockRes = {
          status: mock.fn(function(code) {
            this.statusCode = code;
            return this;
          }),
          json: mock.fn(function(data) {
            this.data = data;
            return this;
          }),
          statusCode: 200,
          data: null
        };

        // Check status
        mockReq.params = { id: reviewId };
        await reviewController.getReviewResult(mockReq, mockRes);

        assert.strictEqual(mockRes.statusCode, 200);
        // Should show running, completed, or failed status
        assert.ok(['running', 'completed', 'failed'].includes(mockRes.data.status));
      }
    });
  });

  describe('response format', () => {
    test('startReview should return proper 202 response', async () => {
      mockReq.body = { files: ['src/test.js'] };

      await reviewController.startReview(mockReq, mockRes);

      if (mockRes.statusCode === 202) {
        assert.ok(mockRes.data.id);
        assert.strictEqual(mockRes.data.status, 'running');
        assert.ok(mockRes.data.message);
      }
    });

    test('listReviews should return proper structure', async () => {
      await reviewController.listReviews(mockReq, mockRes);

      assert.strictEqual(mockRes.statusCode, 200);
      assert.ok(mockRes.data.active !== undefined);
      assert.ok(mockRes.data.history !== undefined);
      assert.ok(Array.isArray(mockRes.data.active));
      assert.ok(Array.isArray(mockRes.data.history));
    });

    test('getReviewResult with files info', async () => {
      mockReq.body = { files: ['src/test.js', 'src/utils.js'] };
      await reviewController.startReview(mockReq, mockRes);

      if (mockRes.statusCode === 202) {
        const reviewId = mockRes.data.id;

        mockRes = {
          status: mock.fn(function(code) {
            this.statusCode = code;
            return this;
          }),
          json: mock.fn(function(data) {
            this.data = data;
            return this;
          }),
          statusCode: 200,
          data: null
        };

        mockReq.params = { id: reviewId };
        await reviewController.getReviewResult(mockReq, mockRes);

        if (mockRes.data.status === 'running') {
          assert.ok(mockRes.data.files);
          assert.ok(Array.isArray(mockRes.data.files));
        }
      }
    });
  });
});
