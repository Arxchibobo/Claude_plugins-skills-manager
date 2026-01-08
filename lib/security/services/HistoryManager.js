/**
 * HistoryManager - Manage persistent storage of security audit results
 *
 * Stores audit history in `.claude/security-audit/history.json`
 * Implements FIFO strategy (max 10 records)
 */

const fs = require('fs').promises;
const path = require('path');
const os = require('os');

/**
 * Default configuration
 */
const DEFAULT_CONFIG = {
  maxRecords: 10,
  historyDir: path.join(os.homedir(), '.claude', 'security-audit'),
  historyFile: 'history.json'
};

/**
 * HistoryManager class
 */
class HistoryManager {
  constructor(config = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.historyPath = path.join(this.config.historyDir, this.config.historyFile);
  }

  /**
   * Initialize history directory and file if not exists
   * @returns {Promise<void>}
   * @private
   */
  async _ensureHistoryFile() {
    try {
      // Create directory if not exists
      await fs.mkdir(this.config.historyDir, { recursive: true });

      // Check if history file exists
      try {
        await fs.access(this.historyPath);
      } catch (error) {
        // File doesn't exist, create empty history
        await fs.writeFile(this.historyPath, JSON.stringify({ records: [] }, null, 2), 'utf-8');
      }
    } catch (error) {
      throw new Error(`Failed to initialize history file: ${error.message}`);
    }
  }

  /**
   * Read history data from file
   * @returns {Promise<Object>} History data
   * @private
   */
  async _readHistory() {
    await this._ensureHistoryFile();

    try {
      const data = await fs.readFile(this.historyPath, 'utf-8');
      return JSON.parse(data);
    } catch (error) {
      throw new Error(`Failed to read history file: ${error.message}`);
    }
  }

  /**
   * Write history data to file
   * @param {Object} history - History data
   * @returns {Promise<void>}
   * @private
   */
  async _writeHistory(history) {
    try {
      await fs.writeFile(this.historyPath, JSON.stringify(history, null, 2), 'utf-8');
    } catch (error) {
      throw new Error(`Failed to write history file: ${error.message}`);
    }
  }

  /**
   * Save result to history
   * @param {Object} result - ScanResult or ReviewResult instance
   * @returns {Promise<string>} Saved result ID
   */
  async save(result) {
    if (!result || typeof result !== 'object') {
      throw new Error('Result must be an object');
    }

    if (!result.id) {
      throw new Error('Result must have an id field');
    }

    // Read current history
    const history = await this._readHistory();

    // Convert result to JSON
    const resultData = result.toJSON ? result.toJSON() : result;

    // Add timestamp if not present
    if (!resultData.timestamp) {
      resultData.timestamp = new Date().toISOString();
    }

    // Create history entry
    const entry = {
      id: resultData.id,
      type: resultData.type,
      timestamp: resultData.timestamp,
      status: resultData.status,
      summary: resultData.summary || null,
      scores: resultData.scores || null,
      duration: resultData.duration || 0
    };

    // Add entry to beginning (most recent first)
    history.records.unshift(entry);

    // Implement FIFO: Keep only last N records
    if (history.records.length > this.config.maxRecords) {
      const removed = history.records.splice(this.config.maxRecords);

      // Delete full result files for removed entries
      for (const removedEntry of removed) {
        await this._deleteResultFile(removedEntry.id).catch(() => {
          // Ignore errors if file doesn't exist
        });
      }
    }

    // Save full result data to separate file
    await this._saveResultFile(resultData);

    // Write updated history
    await this._writeHistory(history);

    return resultData.id;
  }

  /**
   * Load history records with optional filters
   * @param {Object} filters - Filter criteria
   * @param {string} [filters.type] - Filter by result type (scan-result, code-review)
   * @param {string} [filters.status] - Filter by status (pending, running, completed, failed)
   * @param {number} [filters.limit] - Limit number of results
   * @returns {Promise<Array>} Array of history entries
   */
  async load(filters = {}) {
    const history = await this._readHistory();
    let records = history.records;

    // Apply type filter
    if (filters.type) {
      records = records.filter(r => r.type === filters.type);
    }

    // Apply status filter
    if (filters.status) {
      records = records.filter(r => r.status === filters.status);
    }

    // Apply limit
    if (filters.limit && typeof filters.limit === 'number') {
      records = records.slice(0, filters.limit);
    }

    return records;
  }

  /**
   * Load full result data by ID
   * @param {string} id - Result ID
   * @returns {Promise<Object>} Full result data
   */
  async loadResult(id) {
    if (!id || typeof id !== 'string') {
      throw new Error('Result ID must be a non-empty string');
    }

    // Check if result exists in history
    const history = await this._readHistory();
    const entry = history.records.find(r => r.id === id);

    if (!entry) {
      throw new Error(`Result not found: ${id}`);
    }

    // Load full result data from file
    return await this._loadResultFile(id);
  }

  /**
   * Delete result from history
   * @param {string} id - Result ID to delete
   * @returns {Promise<boolean>} True if deleted, false if not found
   */
  async delete(id) {
    if (!id || typeof id !== 'string') {
      throw new Error('Result ID must be a non-empty string');
    }

    // Read current history
    const history = await this._readHistory();

    // Find index of result
    const index = history.records.findIndex(r => r.id === id);

    if (index === -1) {
      return false; // Not found
    }

    // Remove from history
    history.records.splice(index, 1);

    // Delete result file
    await this._deleteResultFile(id).catch(() => {
      // Ignore errors if file doesn't exist
    });

    // Write updated history
    await this._writeHistory(history);

    return true;
  }

  /**
   * Get history statistics
   * @returns {Promise<Object>} Statistics object
   */
  async getStats() {
    const history = await this._readHistory();

    const stats = {
      total: history.records.length,
      byType: {},
      byStatus: {}
    };

    // Count by type
    history.records.forEach(record => {
      const type = record.type || 'unknown';
      stats.byType[type] = (stats.byType[type] || 0) + 1;

      const status = record.status || 'unknown';
      stats.byStatus[status] = (stats.byStatus[status] || 0) + 1;
    });

    return stats;
  }

  /**
   * Clear all history
   * @returns {Promise<void>}
   */
  async clear() {
    const history = await this._readHistory();

    // Delete all result files
    for (const record of history.records) {
      await this._deleteResultFile(record.id).catch(() => {
        // Ignore errors
      });
    }

    // Reset history
    await this._writeHistory({ records: [] });
  }

  /**
   * Save full result data to separate file
   * @param {Object} resultData - Result data
   * @returns {Promise<void>}
   * @private
   */
  async _saveResultFile(resultData) {
    const resultFilePath = path.join(this.config.historyDir, `${resultData.id}.json`);
    await fs.writeFile(resultFilePath, JSON.stringify(resultData, null, 2), 'utf-8');
  }

  /**
   * Load full result data from file
   * @param {string} id - Result ID
   * @returns {Promise<Object>} Result data
   * @private
   */
  async _loadResultFile(id) {
    const resultFilePath = path.join(this.config.historyDir, `${id}.json`);

    try {
      const data = await fs.readFile(resultFilePath, 'utf-8');
      return JSON.parse(data);
    } catch (error) {
      if (error.code === 'ENOENT') {
        throw new Error(`Result file not found: ${id}`);
      }
      throw new Error(`Failed to load result file: ${error.message}`);
    }
  }

  /**
   * Delete result file
   * @param {string} id - Result ID
   * @returns {Promise<void>}
   * @private
   */
  async _deleteResultFile(id) {
    const resultFilePath = path.join(this.config.historyDir, `${id}.json`);
    await fs.unlink(resultFilePath);
  }

  /**
   * Get history file path for testing purposes
   * @returns {string}
   */
  getHistoryPath() {
    return this.historyPath;
  }

  /**
   * Update configuration
   * @param {Object} config - New configuration
   */
  updateConfig(config) {
    this.config = { ...this.config, ...config };
    this.historyPath = path.join(this.config.historyDir, this.config.historyFile);
  }
}

module.exports = HistoryManager;
