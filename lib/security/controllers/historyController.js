/**
 * History Controller - Handle security audit history HTTP requests
 *
 * Endpoints:
 * - GET /api/security/history - Get history records
 * - GET /api/security/history/:id - Get specific result
 * - DELETE /api/security/history/:id - Delete history record
 * - GET /api/security/history/stats - Get history statistics
 * - DELETE /api/security/history - Clear all history
 */

const HistoryManager = require('../services/HistoryManager');

// Singleton instance
const historyManager = new HistoryManager();

/**
 * Get history records with optional filtering
 *
 * GET /api/security/history
 * Query: {
 *   type: string (optional) - Filter by type: 'security-scan', 'code-review'
 *   status: string (optional) - Filter by status: 'pending', 'running', 'completed', 'failed'
 *   limit: number (optional) - Limit results (default: 10, max: 100)
 * }
 *
 * Response 200: {
 *   records: Array<HistoryEntry>
 *   total: number
 * }
 *
 * Response 400: { error: string }
 * Response 500: { error: string }
 */
async function getHistory(req, res) {
  try {
    const { type, status, limit } = req.query;

    // Build filters
    const filters = {};

    if (type) {
      if (!['security-scan', 'code-review'].includes(type)) {
        return res.status(400).json({
          error: 'Invalid type. Must be "security-scan" or "code-review"'
        });
      }
      filters.type = type;
    }

    if (status) {
      if (!['pending', 'running', 'completed', 'failed'].includes(status)) {
        return res.status(400).json({
          error: 'Invalid status. Must be "pending", "running", "completed", or "failed"'
        });
      }
      filters.status = status;
    }

    if (limit) {
      const limitNum = parseInt(limit, 10);
      if (isNaN(limitNum) || limitNum < 1 || limitNum > 100) {
        return res.status(400).json({
          error: 'Invalid limit. Must be a number between 1 and 100'
        });
      }
      filters.limit = limitNum;
    } else {
      filters.limit = 10; // Default limit
    }

    // Load history
    const records = await historyManager.load(filters);

    res.status(200).json({
      records,
      total: records.length
    });

  } catch (error) {
    console.error('Error getting history:', error);
    res.status(500).json({
      error: 'Failed to get history',
      details: error.message
    });
  }
}

/**
 * Get specific result by ID
 *
 * GET /api/security/history/:id
 *
 * Response 200: {
 *   result: ScanResult | ReviewResult
 * }
 *
 * Response 404: { error: string }
 * Response 500: { error: string }
 */
async function getResult(req, res) {
  try {
    const { id } = req.params;

    if (!id) {
      return res.status(400).json({
        error: 'Missing required parameter: id'
      });
    }

    // Load result
    const result = await historyManager.loadResult(id);

    res.status(200).json({
      result
    });

  } catch (error) {
    if (error.message.includes('not found')) {
      return res.status(404).json({
        error: error.message
      });
    }

    console.error('Error getting result:', error);
    res.status(500).json({
      error: 'Failed to get result',
      details: error.message
    });
  }
}

/**
 * Delete history record
 *
 * DELETE /api/security/history/:id
 *
 * Response 200: {
 *   success: true
 *   message: string
 * }
 *
 * Response 404: { error: string }
 * Response 500: { error: string }
 */
async function deleteHistory(req, res) {
  try {
    const { id } = req.params;

    if (!id) {
      return res.status(400).json({
        error: 'Missing required parameter: id'
      });
    }

    // Delete record
    const deleted = await historyManager.delete(id);

    if (!deleted) {
      return res.status(404).json({
        error: `Record not found: ${id}`
      });
    }

    res.status(200).json({
      success: true,
      message: `Record deleted: ${id}`
    });

  } catch (error) {
    console.error('Error deleting history:', error);
    res.status(500).json({
      error: 'Failed to delete history',
      details: error.message
    });
  }
}

/**
 * Get history statistics
 *
 * GET /api/security/history/stats
 *
 * Response 200: {
 *   total: number
 *   byType: { 'security-scan': number, 'code-review': number }
 *   byStatus: { 'pending': number, 'running': number, 'completed': number, 'failed': number }
 * }
 *
 * Response 500: { error: string }
 */
async function getStats(req, res) {
  try {
    const stats = await historyManager.getStats();

    res.status(200).json(stats);

  } catch (error) {
    console.error('Error getting stats:', error);
    res.status(500).json({
      error: 'Failed to get statistics',
      details: error.message
    });
  }
}

/**
 * Clear all history
 *
 * DELETE /api/security/history
 * Query: {
 *   confirm: string (required) - Must be 'true' to confirm deletion
 * }
 *
 * Response 200: {
 *   success: true
 *   message: string
 * }
 *
 * Response 400: { error: string }
 * Response 500: { error: string }
 */
async function clearHistory(req, res) {
  try {
    const { confirm } = req.query;

    // Require explicit confirmation
    if (confirm !== 'true') {
      return res.status(400).json({
        error: 'Confirmation required. Add ?confirm=true to clear all history'
      });
    }

    // Clear history
    await historyManager.clear();

    res.status(200).json({
      success: true,
      message: 'All history cleared'
    });

  } catch (error) {
    console.error('Error clearing history:', error);
    res.status(500).json({
      error: 'Failed to clear history',
      details: error.message
    });
  }
}

module.exports = {
  getHistory,
  getResult,
  deleteHistory,
  getStats,
  clearHistory
};
