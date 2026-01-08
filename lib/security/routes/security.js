/**
 * Security Audit API Routes
 *
 * Provides REST API endpoints for:
 * - Security scanning operations
 * - Code review operations
 * - History management
 *
 * Route Structure:
 * - POST /api/security/scan - Start security scan
 * - GET /api/security/scan/:id - Get scan status
 * - GET /api/security/scans - List all scans
 * - POST /api/security/review - Start code review
 * - GET /api/security/review/:id - Get review result
 * - GET /api/security/reviews - List all reviews
 * - GET /api/security/history - Get history records
 * - GET /api/security/history/:id - Get specific result
 * - DELETE /api/security/history/:id - Delete history record
 * - GET /api/security/history/stats - Get history statistics
 * - DELETE /api/security/history - Clear all history (requires confirmation)
 *
 * CSRF Protection: Origin header validation is enforced by server-static.js
 */

const scanController = require('../controllers/scanController');
const reviewController = require('../controllers/reviewController');
const historyController = require('../controllers/historyController');

class SecurityRoutes {
  constructor() {
    this.initialized = false;
  }

  /**
   * Initialize security routes (if needed for future enhancements)
   */
  async initialize() {
    if (!this.initialized) {
      this.initialized = true;
    }
  }

  /**
   * Parse request body
   */
  async parseBody(req) {
    return new Promise((resolve, reject) => {
      let body = '';
      req.on('data', chunk => body += chunk);
      req.on('end', () => {
        try {
          resolve(JSON.parse(body || '{}'));
        } catch (error) {
          reject(new Error('Invalid JSON'));
        }
      });
      req.on('error', reject);
    });
  }

  /**
   * Send JSON response
   */
  sendJSON(res, statusCode, data) {
    res.writeHead(statusCode, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(data));
  }

  /**
   * Send error response
   */
  sendError(res, statusCode, message) {
    this.sendJSON(res, statusCode, { error: message });
  }

  /**
   * Route handler - dispatches requests to appropriate controller methods
   *
   * @param {http.IncomingMessage} req - HTTP request
   * @param {http.ServerResponse} res - HTTP response
   * @param {string} url - Request URL
   * @param {string} method - HTTP method
   */
  async handleRoute(req, res, url, method) {
    try {
      await this.initialize();

      // Parse body for POST/PUT/PATCH requests
      if (['POST', 'PUT', 'PATCH'].includes(method)) {
        req.body = await this.parseBody(req);
      }

      // Parse URL and query parameters
      const [pathname, queryString] = url.split('?');
      req.query = {};
      if (queryString) {
        const params = new URLSearchParams(queryString);
        for (const [key, value] of params.entries()) {
          req.query[key] = value;
        }
      }

      // Route: POST /api/security/scan
      if (method === 'POST' && pathname === '/api/security/scan') {
        return await scanController.startScan(req, res);
      }

      // Route: GET /api/security/scan/:id
      if (method === 'GET' && pathname.match(/^\/api\/security\/scan\/[^/]+$/)) {
        req.params = { id: pathname.split('/')[4] };
        return await scanController.getScanStatus(req, res);
      }

      // Route: GET /api/security/scans
      if (method === 'GET' && pathname === '/api/security/scans') {
        return await scanController.listScans(req, res);
      }

      // Route: GET /api/security/cli-status (Task 9 - CLI availability check)
      if (method === 'GET' && pathname === '/api/security/cli-status') {
        return await scanController.getCliStatus(req, res);
      }

      // Route: POST /api/security/review
      if (method === 'POST' && pathname === '/api/security/review') {
        return await reviewController.startReview(req, res);
      }

      // Route: GET /api/security/review/:id
      if (method === 'GET' && pathname.match(/^\/api\/security\/review\/[^/]+$/)) {
        req.params = { id: pathname.split('/')[4] };
        return await reviewController.getReviewResult(req, res);
      }

      // Route: GET /api/security/reviews
      if (method === 'GET' && pathname === '/api/security/reviews') {
        return await reviewController.listReviews(req, res);
      }

      // Route: GET /api/security/history
      if (method === 'GET' && pathname === '/api/security/history') {
        return await historyController.getHistory(req, res);
      }

      // Route: GET /api/security/history/stats
      if (method === 'GET' && pathname === '/api/security/history/stats') {
        return await historyController.getStats(req, res);
      }

      // Route: GET /api/security/history/:id
      if (method === 'GET' && pathname.match(/^\/api\/security\/history\/[^/]+$/) && pathname !== '/api/security/history/stats') {
        req.params = { id: pathname.split('/')[4] };
        return await historyController.getResult(req, res);
      }

      // Route: DELETE /api/security/history/:id
      if (method === 'DELETE' && pathname.match(/^\/api\/security\/history\/[^/]+$/)) {
        req.params = { id: pathname.split('/')[4] };
        return await historyController.deleteHistory(req, res);
      }

      // Route: DELETE /api/security/history (clear all - requires confirmation)
      if (method === 'DELETE' && pathname === '/api/security/history') {
        return await historyController.clearHistory(req, res);
      }

      // 404 - Route not found
      this.sendError(res, 404, 'Security API endpoint not found');

    } catch (error) {
      console.error('Security routes error:', error);
      this.sendError(res, 500, error.message);
    }
  }
}

module.exports = SecurityRoutes;
