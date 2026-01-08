/**
 * ReviewResult - Data model for code review results
 *
 * Represents the result of a code review operation including:
 * - Review metadata (id, timestamp, status)
 * - Files reviewed
 * - Quality scores (architecture, quality, security, performance)
 * - Detailed findings list
 * - Performance metrics (duration)
 */

class ReviewResult {
  /**
   * Create a new ReviewResult
   * @param {Object} data - Review result data
   */
  constructor(data = {}) {
    this.id = data.id || this._generateId();
    this.type = data.type || 'code-review';
    this.timestamp = data.timestamp || new Date().toISOString();
    this.files = data.files || [];
    this.status = data.status || 'pending';
    this.scores = data.scores || this._defaultScores();
    this.findings = data.findings || [];
    this.duration = data.duration || 0;
    this.error = data.error || null;
  }

  /**
   * Generate unique review ID
   * @returns {string}
   * @private
   */
  _generateId() {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substr(2, 9);
    return `review_${timestamp}_${random}`;
  }

  /**
   * Get default scores structure
   * @returns {Object}
   * @private
   */
  _defaultScores() {
    return {
      architecture: 0,
      quality: 0,
      security: 0,
      performance: 0
    };
  }

  /**
   * Validate review result data
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

    // Files validation
    if (!Array.isArray(this.files)) {
      errors.push('files must be an array');
    }

    // Status validation
    const validStatuses = ['pending', 'running', 'completed', 'failed'];
    if (!validStatuses.includes(this.status)) {
      errors.push(`status must be one of: ${validStatuses.join(', ')}`);
    }

    // Scores validation
    if (!this.scores || typeof this.scores !== 'object') {
      errors.push('scores is required and must be an object');
    } else {
      const requiredScoreFields = ['architecture', 'quality', 'security', 'performance'];
      for (const field of requiredScoreFields) {
        const score = this.scores[field];
        if (typeof score !== 'number' || score < 0 || score > 100) {
          errors.push(`scores.${field} must be a number between 0 and 100`);
        }
      }
    }

    // Findings validation
    if (!Array.isArray(this.findings)) {
      errors.push('findings must be an array');
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
   * Update quality scores
   * @param {Object} scores - Score updates
   */
  updateScores(scores) {
    if (!scores || typeof scores !== 'object') {
      throw new Error('Scores must be an object');
    }

    const validFields = ['architecture', 'quality', 'security', 'performance'];
    for (const [field, value] of Object.entries(scores)) {
      if (!validFields.includes(field)) {
        throw new Error(`Invalid score field: ${field}`);
      }
      if (typeof value !== 'number' || value < 0 || value > 100) {
        throw new Error(`Score ${field} must be a number between 0 and 100`);
      }
      this.scores[field] = value;
    }
  }

  /**
   * Add a finding to the review result
   * @param {Object} finding - Finding object
   */
  addFinding(finding) {
    if (!finding || typeof finding !== 'object') {
      throw new Error('Finding must be an object');
    }

    // Validate finding has required fields
    const requiredFields = ['id', 'priority', 'category', 'title'];
    for (const field of requiredFields) {
      if (!finding[field]) {
        throw new Error(`Finding missing required field: ${field}`);
      }
    }

    // Validate priority
    const validPriorities = ['P0', 'P1', 'P2', 'P3'];
    if (!validPriorities.includes(finding.priority)) {
      throw new Error(`Invalid priority: ${finding.priority}. Must be one of: ${validPriorities.join(', ')}`);
    }

    // Validate category
    const validCategories = ['Architecture', 'Quality', 'Security', 'Performance'];
    if (!validCategories.includes(finding.category)) {
      throw new Error(`Invalid category: ${finding.category}. Must be one of: ${validCategories.join(', ')}`);
    }

    this.findings.push(finding);
  }

  /**
   * Get findings by priority
   * @param {string} priority - Priority level (P0, P1, P2, P3)
   * @returns {Array}
   */
  getFindingsByPriority(priority) {
    return this.findings.filter(f => f.priority === priority);
  }

  /**
   * Get findings by category
   * @param {string} category - Category name
   * @returns {Array}
   */
  getFindingsByCategory(category) {
    return this.findings.filter(f => f.category === category);
  }

  /**
   * Calculate average score
   * @returns {number}
   */
  getAverageScore() {
    const scores = Object.values(this.scores);
    const sum = scores.reduce((acc, score) => acc + score, 0);
    return Math.round(sum / scores.length);
  }

  /**
   * Mark review as completed
   * @param {number} duration - Review duration in seconds
   */
  complete(duration) {
    this.status = 'completed';
    this.duration = duration || this.duration;
  }

  /**
   * Mark review as failed
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
      files: this.files,
      status: this.status,
      scores: this.scores,
      findings: this.findings,
      duration: this.duration,
      error: this.error
    };
  }

  /**
   * Create ReviewResult from plain object
   * @param {Object} data - Plain object data
   * @returns {ReviewResult}
   */
  static fromJSON(data) {
    return new ReviewResult(data);
  }
}

module.exports = ReviewResult;
