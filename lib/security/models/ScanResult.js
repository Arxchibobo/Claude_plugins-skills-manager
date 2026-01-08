/**
 * ScanResult - Data model for security scan results
 *
 * Represents the result of a security scan operation including:
 * - Scan metadata (id, timestamp, status)
 * - Scope information (what was scanned)
 * - Summary statistics (issue counts by severity)
 * - Detailed issue list
 * - Performance metrics (duration)
 */

class ScanResult {
  /**
   * Create a new ScanResult
   * @param {Object} data - Scan result data
   */
  constructor(data = {}) {
    this.id = data.id || this._generateId();
    this.type = data.type || 'security-scan';
    this.timestamp = data.timestamp || new Date().toISOString();
    this.scope = data.scope || {};
    this.status = data.status || 'pending';
    this.progress = data.progress || 0;
    this.summary = data.summary || this._defaultSummary();
    this.issues = data.issues || [];
    this.duration = data.duration || 0;
    this.error = data.error || null;
  }

  /**
   * Generate unique scan ID
   * @returns {string}
   * @private
   */
  _generateId() {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substr(2, 9);
    return `scan_${timestamp}_${random}`;
  }

  /**
   * Get default summary structure
   * @returns {Object}
   * @private
   */
  _defaultSummary() {
    return {
      total: 0,
      critical: 0,
      high: 0,
      medium: 0,
      low: 0,
      fixed: 0
    };
  }

  /**
   * Validate scan result data
   * @returns {Object} - { valid: boolean, errors: string[] }
   */
  validate() {
    const errors = [];

    // Required fields
    if (!this.id || typeof this.id !== 'string') {
      errors.push('id is required and must be a string');
    }

    if (!this.type || typeof this.type !== 'string') {
      errors.push('type is required and must be a string');
    }

    if (!this.timestamp || typeof this.timestamp !== 'string') {
      errors.push('timestamp is required and must be a string');
    }

    // Status validation
    const validStatuses = ['pending', 'running', 'completed', 'failed'];
    if (!validStatuses.includes(this.status)) {
      errors.push(`status must be one of: ${validStatuses.join(', ')}`);
    }

    // Progress validation
    if (typeof this.progress !== 'number' || this.progress < 0 || this.progress > 100) {
      errors.push('progress must be a number between 0 and 100');
    }

    // Summary validation
    if (!this.summary || typeof this.summary !== 'object') {
      errors.push('summary is required and must be an object');
    } else {
      const requiredSummaryFields = ['total', 'critical', 'high', 'medium', 'low', 'fixed'];
      for (const field of requiredSummaryFields) {
        if (typeof this.summary[field] !== 'number' || this.summary[field] < 0) {
          errors.push(`summary.${field} must be a non-negative number`);
        }
      }
    }

    // Issues validation
    if (!Array.isArray(this.issues)) {
      errors.push('issues must be an array');
    }

    // Duration validation
    if (typeof this.duration !== 'number' || this.duration < 0) {
      errors.push('duration must be a non-negative number');
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }

  /**
   * Update scan progress
   * @param {number} progress - Progress percentage (0-100)
   */
  updateProgress(progress) {
    if (typeof progress === 'number' && progress >= 0 && progress <= 100) {
      this.progress = progress;
      if (progress === 100 && this.status === 'running') {
        this.status = 'completed';
      }
    }
  }

  /**
   * Add an issue to the scan result
   * @param {Object} issue - Issue object
   */
  addIssue(issue) {
    if (!issue || typeof issue !== 'object') {
      throw new Error('Issue must be an object');
    }

    // Validate issue has required fields
    const requiredFields = ['id', 'severity', 'title', 'file'];
    for (const field of requiredFields) {
      if (!issue[field]) {
        throw new Error(`Issue missing required field: ${field}`);
      }
    }

    this.issues.push(issue);
    this._updateSummary();
  }

  /**
   * Update summary statistics based on issues
   * @private
   */
  _updateSummary() {
    this.summary = {
      total: this.issues.length,
      critical: this.issues.filter(i => i.severity === 'critical').length,
      high: this.issues.filter(i => i.severity === 'high').length,
      medium: this.issues.filter(i => i.severity === 'medium').length,
      low: this.issues.filter(i => i.severity === 'low').length,
      fixed: this.issues.filter(i => i.fixed === true).length
    };
  }

  /**
   * Mark scan as completed
   * @param {number} duration - Scan duration in seconds
   */
  complete(duration) {
    this.status = 'completed';
    this.progress = 100;
    this.duration = duration || this.duration;
  }

  /**
   * Mark scan as failed
   * @param {string|Error} error - Error message or Error object
   */
  fail(error) {
    this.status = 'failed';
    this.error = error instanceof Error ? error.message : error;
  }

  /**
   * Convert to plain object for JSON serialization
   * @returns {Object}
   */
  toJSON() {
    return {
      id: this.id,
      type: this.type,
      timestamp: this.timestamp,
      scope: this.scope,
      status: this.status,
      progress: this.progress,
      summary: this.summary,
      issues: this.issues,
      duration: this.duration,
      error: this.error
    };
  }

  /**
   * Create ScanResult from plain object
   * @param {Object} data - Plain object data
   * @returns {ScanResult}
   */
  static fromJSON(data) {
    return new ScanResult(data);
  }
}

module.exports = ScanResult;
