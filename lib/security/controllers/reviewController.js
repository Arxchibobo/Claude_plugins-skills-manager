/**
 * Review Controller - Handle code review HTTP requests
 *
 * Endpoints:
 * - POST /api/security/review - Start new code review
 * - GET /api/security/review/:id - Get review status/result
 */

const ClaudeIntegration = require('../services/ClaudeIntegration');
const ResultParser = require('../services/ResultParser');
const HistoryManager = require('../services/HistoryManager');

// Singleton instances
const claudeIntegration = new ClaudeIntegration();
const resultParser = new ResultParser();
const historyManager = new HistoryManager();

// In-memory store for active reviews (in real app, use Redis or database)
const activeReviews = new Map();

/**
 * Start a new code review
 *
 * POST /api/security/review
 * Body: {
 *   files: string[] (required) - Files to review
 *   scope: string (optional) - Review scope: 'full', 'quick', 'custom'
 *   focus: string[] (optional) - Focus areas: 'security', 'performance', 'quality', 'architecture'
 *   format: string (optional) - Output format: 'json' or 'markdown'
 * }
 *
 * Response 202: {
 *   id: string - Review ID
 *   status: 'running'
 *   message: string
 * }
 *
 * Response 400: { error: string }
 * Response 500: { error: string }
 */
async function startReview(req, res) {
  try {
    // Validate request body
    const { files, scope, focus, format } = req.body;

    if (!files || !Array.isArray(files) || files.length === 0) {
      return res.status(400).json({
        error: 'Missing required field: files (must be a non-empty array)'
      });
    }

    // Check Claude CLI availability
    const availability = await claudeIntegration.checkClaudeAvailability();
    if (!availability.available) {
      return res.status(500).json({
        error: 'Claude CLI is not available',
        details: availability.error
      });
    }

    // Build review config
    const reviewConfig = {
      files,
      scope,
      focus,
      format: format || 'json'
    };

    // Start review asynchronously
    const reviewPromise = claudeIntegration.runCodeReview(reviewConfig)
      .then(rawOutput => {
        // Parse result
        const reviewResult = resultParser.parseReviewResult(rawOutput, { format: reviewConfig.format });
        reviewResult.complete();

        // Save to history
        return historyManager.save(reviewResult)
          .then(() => {
            // Update active review status
            const reviewData = activeReviews.get(reviewResult.id);
            if (reviewData) {
              reviewData.status = 'completed';
              reviewData.result = reviewResult.toJSON();
            }
            return reviewResult;
          });
      })
      .catch(error => {
        // Mark review as failed
        const reviewId = `review_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        const reviewData = activeReviews.get(reviewId);
        if (reviewData) {
          reviewData.status = 'failed';
          reviewData.error = error.message;
        }
        throw error;
      });

    // Generate review ID
    const reviewId = `review_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    // Store active review
    activeReviews.set(reviewId, {
      id: reviewId,
      status: 'running',
      files,
      startTime: new Date().toISOString(),
      promise: reviewPromise
    });

    // Return 202 Accepted
    res.status(202).json({
      id: reviewId,
      status: 'running',
      message: 'Code review started'
    });

  } catch (error) {
    console.error('Error starting review:', error);
    res.status(500).json({
      error: 'Failed to start code review',
      details: error.message
    });
  }
}

/**
 * Get review status or result
 *
 * GET /api/security/review/:id
 *
 * Response 200 (running): {
 *   id: string
 *   status: 'running'
 *   files: string[]
 *   startTime: string
 * }
 *
 * Response 200 (completed): {
 *   id: string
 *   status: 'completed'
 *   result: ReviewResult
 * }
 *
 * Response 200 (failed): {
 *   id: string
 *   status: 'failed'
 *   error: string
 * }
 *
 * Response 404: { error: string }
 * Response 500: { error: string }
 */
async function getReviewResult(req, res) {
  try {
    const { id } = req.params;

    if (!id) {
      return res.status(400).json({
        error: 'Missing required parameter: id'
      });
    }

    // Check active reviews first
    const activeReview = activeReviews.get(id);
    if (activeReview) {
      if (activeReview.status === 'running') {
        return res.status(200).json({
          id: activeReview.id,
          status: 'running',
          files: activeReview.files,
          startTime: activeReview.startTime
        });
      } else if (activeReview.status === 'completed') {
        // Remove from active reviews after returning result
        activeReviews.delete(id);
        return res.status(200).json({
          id: activeReview.id,
          status: 'completed',
          result: activeReview.result
        });
      } else if (activeReview.status === 'failed') {
        // Remove from active reviews after returning error
        const error = activeReview.error;
        activeReviews.delete(id);
        return res.status(200).json({
          id: activeReview.id,
          status: 'failed',
          error
        });
      }
    }

    // Check history for completed reviews
    try {
      const result = await historyManager.loadResult(id);
      return res.status(200).json({
        id: result.id,
        status: result.status,
        result
      });
    } catch (error) {
      // Not found in history either
      return res.status(404).json({
        error: `Review not found: ${id}`
      });
    }

  } catch (error) {
    console.error('Error getting review result:', error);
    res.status(500).json({
      error: 'Failed to get review result',
      details: error.message
    });
  }
}

/**
 * List all reviews (active and completed)
 *
 * GET /api/security/reviews
 * Query: {
 *   status: string (optional) - Filter by status: 'running', 'completed', 'failed'
 *   limit: number (optional) - Limit results
 * }
 *
 * Response 200: {
 *   active: Array<{ id, status, files, startTime }>
 *   history: Array<HistoryEntry>
 * }
 */
async function listReviews(req, res) {
  try {
    const { status, limit } = req.query;

    // Get active reviews
    let activeList = Array.from(activeReviews.values()).map(review => ({
      id: review.id,
      status: review.status,
      files: review.files,
      startTime: review.startTime
    }));

    // Filter active reviews by status if provided
    if (status === 'running') {
      activeList = activeList.filter(r => r.status === 'running');
    } else if (status === 'completed') {
      activeList = [];
    } else if (status === 'failed') {
      activeList = activeList.filter(r => r.status === 'failed');
    }

    // Get history reviews
    const historyFilters = {
      type: 'code-review'
    };

    if (status === 'running') {
      // Don't include history for running-only filter
      historyFilters.status = 'running';
    } else if (status === 'completed') {
      historyFilters.status = 'completed';
    } else if (status === 'failed') {
      historyFilters.status = 'failed';
    }

    if (limit && !isNaN(parseInt(limit, 10))) {
      historyFilters.limit = parseInt(limit, 10);
    }

    const historyList = await historyManager.load(historyFilters);

    res.status(200).json({
      active: activeList,
      history: historyList
    });

  } catch (error) {
    console.error('Error listing reviews:', error);
    res.status(500).json({
      error: 'Failed to list reviews',
      details: error.message
    });
  }
}

module.exports = {
  startReview,
  getReviewResult,
  listReviews
};
