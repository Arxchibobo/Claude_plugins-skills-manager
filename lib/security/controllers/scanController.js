/**
 * Scan Controller - Handle security scan HTTP requests
 *
 * Endpoints:
 * - POST /api/security/scan - Start new security scan
 * - GET /api/security/scan/:id - Get scan status/result
 */

const ClaudeIntegration = require('../services/ClaudeIntegration');
const ResultParser = require('../services/ResultParser');
const HistoryManager = require('../services/HistoryManager');

// Singleton instances
const claudeIntegration = new ClaudeIntegration();
const resultParser = new ResultParser();
const historyManager = new HistoryManager();

// In-memory store for active scans (in real app, use Redis or database)
const activeScans = new Map();

/**
 * Start a new security scan
 *
 * POST /api/security/scan
 * Body: {
 *   path: string (required) - Directory or file to scan
 *   scope: string (optional) - Scan scope: 'full', 'quick', 'custom'
 *   exclude: string[] (optional) - Patterns to exclude
 *   format: string (optional) - Output format: 'json' or 'markdown'
 * }
 *
 * Response 202: {
 *   id: string - Scan ID
 *   status: 'running'
 *   message: string
 * }
 *
 * Response 400: { error: string }
 * Response 500: { error: string }
 */
async function startScan(req, res) {
  try {
    // Validate request body
    const { path, scope, exclude, format } = req.body;

    if (!path || typeof path !== 'string') {
      return res.status(400).json({
        error: 'Missing required field: path'
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

    // Build scan config
    const scanConfig = {
      path,
      scope,
      exclude,
      format: format || 'json'
    };

    // Start scan asynchronously
    const scanPromise = claudeIntegration.runSecurityScan(scanConfig)
      .then(rawOutput => {
        // Parse result
        const scanResult = resultParser.parseScanResult(rawOutput, { format: scanConfig.format });
        scanResult.complete();

        // Save to history
        return historyManager.save(scanResult)
          .then(() => {
            // Update active scan status
            const scanData = activeScans.get(scanResult.id);
            if (scanData) {
              scanData.status = 'completed';
              scanData.result = scanResult.toJSON();
            }
            return scanResult;
          });
      })
      .catch(error => {
        // Mark scan as failed
        const scanId = `scan_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        const scanData = activeScans.get(scanId);
        if (scanData) {
          scanData.status = 'failed';
          scanData.error = error.message;
        }
        throw error;
      });

    // Generate scan ID
    const scanId = `scan_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    // Store active scan
    activeScans.set(scanId, {
      id: scanId,
      status: 'running',
      path,
      startTime: new Date().toISOString(),
      promise: scanPromise
    });

    // Return 202 Accepted
    res.status(202).json({
      id: scanId,
      status: 'running',
      message: 'Security scan started'
    });

  } catch (error) {
    console.error('Error starting scan:', error);
    res.status(500).json({
      error: 'Failed to start security scan',
      details: error.message
    });
  }
}

/**
 * Get scan status or result
 *
 * GET /api/security/scan/:id
 *
 * Response 200 (running): {
 *   id: string
 *   status: 'running'
 *   path: string
 *   startTime: string
 * }
 *
 * Response 200 (completed): {
 *   id: string
 *   status: 'completed'
 *   result: ScanResult
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
async function getScanStatus(req, res) {
  try {
    const { id } = req.params;

    if (!id) {
      return res.status(400).json({
        error: 'Missing required parameter: id'
      });
    }

    // Check active scans first
    const activeScan = activeScans.get(id);
    if (activeScan) {
      if (activeScan.status === 'running') {
        return res.status(200).json({
          id: activeScan.id,
          status: 'running',
          path: activeScan.path,
          startTime: activeScan.startTime
        });
      } else if (activeScan.status === 'completed') {
        // Remove from active scans after returning result
        activeScans.delete(id);
        return res.status(200).json({
          id: activeScan.id,
          status: 'completed',
          result: activeScan.result
        });
      } else if (activeScan.status === 'failed') {
        // Remove from active scans after returning error
        const error = activeScan.error;
        activeScans.delete(id);
        return res.status(200).json({
          id: activeScan.id,
          status: 'failed',
          error
        });
      }
    }

    // Check history for completed scans
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
        error: `Scan not found: ${id}`
      });
    }

  } catch (error) {
    console.error('Error getting scan status:', error);
    res.status(500).json({
      error: 'Failed to get scan status',
      details: error.message
    });
  }
}

/**
 * List all scans (active and completed)
 *
 * GET /api/security/scans
 * Query: {
 *   status: string (optional) - Filter by status: 'running', 'completed', 'failed'
 *   limit: number (optional) - Limit results
 * }
 *
 * Response 200: {
 *   active: Array<{ id, status, path, startTime }>
 *   history: Array<HistoryEntry>
 * }
 */
async function listScans(req, res) {
  try {
    const { status, limit } = req.query;

    // Get active scans
    let activeList = Array.from(activeScans.values()).map(scan => ({
      id: scan.id,
      status: scan.status,
      path: scan.path,
      startTime: scan.startTime
    }));

    // Filter active scans by status if provided
    if (status === 'running') {
      activeList = activeList.filter(s => s.status === 'running');
    } else if (status === 'completed') {
      activeList = [];
    } else if (status === 'failed') {
      activeList = activeList.filter(s => s.status === 'failed');
    }

    // Get history scans
    const historyFilters = {
      type: 'security-scan'
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
    console.error('Error listing scans:', error);
    res.status(500).json({
      error: 'Failed to list scans',
      details: error.message
    });
  }
}

module.exports = {
  startScan,
  getScanStatus,
  listScans
};
