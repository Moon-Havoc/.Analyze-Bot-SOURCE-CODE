/**
 * Caps Filter
 * Detects and blocks excessive capitalization (placeholder).
 * 
 * Filter interface:
 * - id: Unique identifier for the filter
 * - displayName: Human-readable name for UI
 * - defaultConfig: Default configuration options for this filter
 * - check: Async function that evaluates messages
 * 
 * @returns {{triggered: boolean, reason?: string}}
 */

const capsFilter = {
  id: 'caps',
  displayName: 'Caps',
  defaultConfig: {
    minCapsPercentage: 70,
    minCapsLength: 10,
  },

  /**
   * Checks if a message has excessive capitalization.
   * Placeholder implementation - always returns false.
   * @param {Message} message - Discord message object
   * @param {object} config - Filter configuration
   * @param {number} config.minCapsPercentage - Minimum percentage of caps to trigger
   * @param {number} config.minCapsLength - Minimum message length to check
   * @returns {Promise<{triggered: boolean, reason?: string}>}
   */
  async check(message, config) {
    // Placeholder: full caps detection logic to be implemented
    return { triggered: false };
  },
};

module.exports = { capsFilter };
