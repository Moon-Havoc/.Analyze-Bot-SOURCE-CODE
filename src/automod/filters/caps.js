/**
 * Caps Filter
 * Detects and blocks excessive capitalization.
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
   * @param {Message} message - Discord message object
   * @param {object} config - Filter configuration
   * @param {number} config.minCapsPercentage - Minimum percentage of caps to trigger
   * @param {number} config.minCapsLength - Minimum message length to check
   * @returns {Promise<{triggered: boolean, reason?: string}>}
   */
  async check(message, config) {
    const { minCapsPercentage, minCapsLength } = config;
    const content = message.content;

    // Skip if message is too short
    if (content.length < minCapsLength) {
      return { triggered: false };
    }

    // Count uppercase letters (excluding URLs and special cases)
    const letters = content.replace(/[^a-zA-Z]/g, '');
    if (letters.length === 0) {
      return { triggered: false };
    }

    const uppercaseLetters = letters.replace(/[^A-Z]/g, '');
    const capsPercentage = (uppercaseLetters.length / letters.length) * 100;

    if (capsPercentage >= minCapsPercentage) {
      return {
        triggered: true,
        reason: `Excessive capitalization: ${Math.round(capsPercentage)}% caps`,
      };
    }

    return { triggered: false };
  },
};

module.exports = { capsFilter };
