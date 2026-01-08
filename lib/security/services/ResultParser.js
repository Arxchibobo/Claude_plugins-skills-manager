/**
 * ResultParser - Parse CLI output into structured result objects
 *
 * Supports parsing both JSON and Markdown output formats from Claude CLI.
 * Normalizes severity and priority levels to standard values.
 */

const ScanResult = require('../models/ScanResult');
const ReviewResult = require('../models/ReviewResult');

/**
 * Severity level mapping to normalize different naming conventions
 */
const SEVERITY_MAP = {
  'critical': 'critical',
  'high': 'high',
  'medium': 'medium',
  'moderate': 'medium',
  'low': 'low',
  'info': 'low',
  'informational': 'low',
  'warning': 'medium',
  'error': 'high',
  'severe': 'critical'
};

/**
 * Priority level mapping to normalize different naming conventions
 */
const PRIORITY_MAP = {
  'p0': 'P0',
  'critical': 'P0',
  'blocker': 'P0',
  'p1': 'P1',
  'high': 'P1',
  'important': 'P1',
  'p2': 'P2',
  'medium': 'P2',
  'normal': 'P2',
  'p3': 'P3',
  'low': 'P3',
  'minor': 'P3'
};

/**
 * ResultParser class
 */
class ResultParser {
  /**
   * Parse security scan result from CLI output
   * @param {string} rawOutput - Raw output from security-scanning:sast
   * @param {Object} options - Parsing options
   * @param {string} [options.format='auto'] - Output format: 'json', 'markdown', or 'auto'
   * @returns {ScanResult} Parsed scan result
   */
  parseScanResult(rawOutput, options = {}) {
    const format = options.format || 'auto';

    // Detect format if auto
    let detectedFormat = format;
    if (format === 'auto') {
      detectedFormat = this._detectFormat(rawOutput);
    }

    // Parse based on format
    if (detectedFormat === 'json') {
      return this._parseScanResultJSON(rawOutput);
    } else {
      return this._parseScanResultMarkdown(rawOutput);
    }
  }

  /**
   * Parse code review result from CLI output
   * @param {string} rawOutput - Raw output from code-review-ai:ai-review
   * @param {Object} options - Parsing options
   * @param {string} [options.format='auto'] - Output format: 'json', 'markdown', or 'auto'
   * @returns {ReviewResult} Parsed review result
   */
  parseReviewResult(rawOutput, options = {}) {
    const format = options.format || 'auto';

    // Detect format if auto
    let detectedFormat = format;
    if (format === 'auto') {
      detectedFormat = this._detectFormat(rawOutput);
    }

    // Parse based on format
    if (detectedFormat === 'json') {
      return this._parseReviewResultJSON(rawOutput);
    } else {
      return this._parseReviewResultMarkdown(rawOutput);
    }
  }

  /**
   * Detect output format (JSON or Markdown)
   * @param {string} output - Raw output
   * @returns {string} Detected format: 'json' or 'markdown'
   * @private
   */
  _detectFormat(output) {
    if (!output || typeof output !== 'string') {
      return 'markdown';
    }

    const trimmed = output.trim();

    // Try to parse as JSON
    if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
      try {
        JSON.parse(trimmed);
        return 'json';
      } catch (e) {
        return 'markdown';
      }
    }

    return 'markdown';
  }

  /**
   * Parse scan result from JSON output
   * @param {string} jsonOutput - JSON formatted output
   * @returns {ScanResult} Parsed scan result
   * @private
   */
  _parseScanResultJSON(jsonOutput) {
    let data;
    try {
      data = JSON.parse(jsonOutput);
    } catch (error) {
      throw new Error(`Failed to parse JSON output: ${error.message}`);
    }

    const scanResult = new ScanResult();

    // Extract issues
    if (data.issues && Array.isArray(data.issues)) {
      data.issues.forEach(issue => {
        const description = issue.description || issue.message || 'No description';
        const title = issue.title || (description.length > 50 ? description.substring(0, 50) + '...' : description);
        scanResult.addIssue({
          id: issue.id || `issue_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
          severity: this._normalizeSeverity(issue.severity),
          title: title,
          file: issue.file || issue.path || 'unknown',
          line: issue.line || issue.lineNumber || 0,
          column: issue.column || 0,
          description: description,
          rule: issue.rule || issue.ruleId || null,
          fixed: issue.fixed || false
        });
      });
    }

    // Extract metadata
    if (data.metadata) {
      scanResult.metadata = data.metadata;
    }

    // Extract progress if provided
    if (data.progress !== undefined) {
      scanResult.updateProgress(data.progress);
    }

    return scanResult;
  }

  /**
   * Parse scan result from Markdown output
   * @param {string} markdownOutput - Markdown formatted output
   * @returns {ScanResult} Parsed scan result
   * @private
   */
  _parseScanResultMarkdown(markdownOutput) {
    const scanResult = new ScanResult();

    if (!markdownOutput || typeof markdownOutput !== 'string') {
      return scanResult;
    }

    const lines = markdownOutput.split('\n');

    // Parse markdown sections
    let currentSection = null;
    let issueBuffer = [];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();

      // Detect section headers
      if (line.startsWith('##')) {
        // Save previous section's issues
        if (issueBuffer.length > 0) {
          this._parseMarkdownIssues(issueBuffer, scanResult);
          issueBuffer = [];
        }

        currentSection = line.replace(/^#+\s*/, '').toLowerCase();
        continue;
      }

      // Collect issue lines
      if (line.startsWith('- ') || line.startsWith('* ')) {
        issueBuffer.push(line);
      }
    }

    // Parse remaining issues
    if (issueBuffer.length > 0) {
      this._parseMarkdownIssues(issueBuffer, scanResult);
    }

    return scanResult;
  }

  /**
   * Parse issues from markdown list items
   * @param {Array<string>} lines - Array of markdown list lines
   * @param {ScanResult} scanResult - Scan result to add issues to
   * @private
   */
  _parseMarkdownIssues(lines, scanResult) {
    lines.forEach(line => {
      // Remove list marker
      const content = line.replace(/^[-*]\s*/, '');

      // Try to extract issue information using common patterns
      // Pattern: [severity] file:line - description
      const pattern1 = /\[(.*?)\]\s+(.+?):(\d+)\s*-\s*(.+)/;
      const match1 = content.match(pattern1);

      if (match1) {
        const description = match1[4];
        const title = description.length > 50 ? description.substring(0, 50) + '...' : description;
        scanResult.addIssue({
          id: `issue_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
          severity: this._normalizeSeverity(match1[1]),
          title: title,
          file: match1[2],
          line: parseInt(match1[3], 10),
          column: 0,
          description: description,
          rule: null,
          fixed: false
        });
        return;
      }

      // Pattern: file:line:column - [severity] description
      const pattern2 = /(.+?):(\d+):(\d+)\s*-\s*\[(.*?)\]\s*(.+)/;
      const match2 = content.match(pattern2);

      if (match2) {
        const description = match2[5];
        const title = description.length > 50 ? description.substring(0, 50) + '...' : description;
        scanResult.addIssue({
          id: `issue_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
          severity: this._normalizeSeverity(match2[4]),
          title: title,
          file: match2[1],
          line: parseInt(match2[2], 10),
          column: parseInt(match2[3], 10),
          description: description,
          rule: null,
          fixed: false
        });
        return;
      }

      // Fallback: Just store the line as a generic issue
      const title = content.length > 50 ? content.substring(0, 50) + '...' : content;
      scanResult.addIssue({
        id: `issue_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        severity: 'low',
        title: title,
        file: 'unknown',
        line: 0,
        column: 0,
        description: content,
        rule: null,
        fixed: false
      });
    });
  }

  /**
   * Parse review result from JSON output
   * @param {string} jsonOutput - JSON formatted output
   * @returns {ReviewResult} Parsed review result
   * @private
   */
  _parseReviewResultJSON(jsonOutput) {
    let data;
    try {
      data = JSON.parse(jsonOutput);
    } catch (error) {
      throw new Error(`Failed to parse JSON output: ${error.message}`);
    }

    const reviewResult = new ReviewResult();

    // Extract files
    if (data.files && Array.isArray(data.files)) {
      reviewResult.files = data.files;
    }

    // Extract scores
    if (data.scores) {
      reviewResult.updateScores({
        architecture: data.scores.architecture || 0,
        quality: data.scores.quality || 0,
        security: data.scores.security || 0,
        performance: data.scores.performance || 0
      });
    }

    // Extract findings
    if (data.findings && Array.isArray(data.findings)) {
      data.findings.forEach(finding => {
        reviewResult.addFinding({
          id: finding.id || `finding_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
          priority: this._normalizePriority(finding.priority),
          category: finding.category || 'Quality',
          title: finding.title || 'No title',
          description: finding.description || '',
          file: finding.file || null,
          line: finding.line || null,
          suggestion: finding.suggestion || null
        });
      });
    }

    return reviewResult;
  }

  /**
   * Parse review result from Markdown output
   * @param {string} markdownOutput - Markdown formatted output
   * @returns {ReviewResult} Parsed review result
   * @private
   */
  _parseReviewResultMarkdown(markdownOutput) {
    const reviewResult = new ReviewResult();

    if (!markdownOutput || typeof markdownOutput !== 'string') {
      return reviewResult;
    }

    const lines = markdownOutput.split('\n');

    // Extract scores from markdown
    // Pattern matches: "architecture: 90", "quality score: 85", "SECURITY: 95", etc.
    const scorePattern = /(architecture|quality|security|performance)(?:\s+score)?[:\s]+(\d+)/gi;
    let match;
    const scores = {
      architecture: 0,
      quality: 0,
      security: 0,
      performance: 0
    };

    while ((match = scorePattern.exec(markdownOutput)) !== null) {
      const key = match[1].toLowerCase();
      const value = parseInt(match[2], 10);
      if (scores.hasOwnProperty(key)) {
        scores[key] = value;
      }
    }

    // Only update if at least one score was found
    if (Object.values(scores).some(s => s > 0)) {
      reviewResult.updateScores(scores);
    }

    // Parse findings from markdown sections
    let currentSection = null;
    let findingBuffer = [];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();

      // Detect section headers
      if (line.startsWith('##')) {
        // Save previous section's findings
        if (findingBuffer.length > 0) {
          this._parseMarkdownFindings(findingBuffer, reviewResult);
          findingBuffer = [];
        }

        currentSection = line.replace(/^#+\s*/, '');
        continue;
      }

      // Collect finding lines
      if (line.startsWith('- ') || line.startsWith('* ')) {
        findingBuffer.push(line);
      }
    }

    // Parse remaining findings
    if (findingBuffer.length > 0) {
      this._parseMarkdownFindings(findingBuffer, reviewResult);
    }

    return reviewResult;
  }

  /**
   * Parse findings from markdown list items
   * @param {Array<string>} lines - Array of markdown list lines
   * @param {ReviewResult} reviewResult - Review result to add findings to
   * @private
   */
  _parseMarkdownFindings(lines, reviewResult) {
    lines.forEach(line => {
      // Remove list marker
      const content = line.replace(/^[-*]\s*/, '');

      // Try to extract finding information
      // Pattern: [priority] category: title
      const pattern1 = /\[(.*?)\]\s+(.+?):\s*(.+)/;
      const match1 = content.match(pattern1);

      if (match1) {
        reviewResult.addFinding({
          id: `finding_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
          priority: this._normalizePriority(match1[1]),
          category: match1[2],
          title: match1[3],
          description: '',
          file: null,
          line: null,
          suggestion: null
        });
        return;
      }

      // Fallback: Generic finding
      reviewResult.addFinding({
        id: `finding_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        priority: 'P2',
        category: 'Quality',
        title: content,
        description: '',
        file: null,
        line: null,
        suggestion: null
      });
    });
  }

  /**
   * Normalize severity level to standard values
   * @param {string} severity - Raw severity value
   * @returns {string} Normalized severity: 'critical', 'high', 'medium', or 'low'
   * @private
   */
  _normalizeSeverity(severity) {
    if (!severity) return 'low';

    const normalized = String(severity).toLowerCase().trim();
    return SEVERITY_MAP[normalized] || 'low';
  }

  /**
   * Normalize priority level to standard values
   * @param {string} priority - Raw priority value
   * @returns {string} Normalized priority: 'P0', 'P1', 'P2', or 'P3'
   * @private
   */
  _normalizePriority(priority) {
    if (!priority) return 'P2';

    const normalized = String(priority).toLowerCase().trim();
    return PRIORITY_MAP[normalized] || 'P2';
  }
}

module.exports = ResultParser;
