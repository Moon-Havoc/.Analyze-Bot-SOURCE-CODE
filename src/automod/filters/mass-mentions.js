/**
 * Mass Mentions Filter
 * Detects and blocks mass mention spam (placeholder).
 * 
 * Filter interface:
 * - id: Unique identifier for the filter
 * - displayName: Human-readable name for UI
 * - defaultConfig: Default configuration options for this filter
 * - check: Async function that evaluates messages
 * 
 * @returns {{triggered: boolean, reason?: string}}
 */

const massMentionsFilter = {
  id: 'mass-mentions',
  displayName: 'Mass Mentions',
  defaultConfig: {
    maxUserMentions: 5,
    maxRoleMentions: 3,
    maxEveryoneMentions: 1,
  },

  /**
   * Checks if a message contains mass mentions.
   * Placeholder implementation - always returns false.
   * @param {Message} message - Discord message object
   * @param {object} config - Filter configuration
   * @param {number} config.maxUserMentions - Maximum user mentions allowed
   * @param {number} config.maxRoleMentions - Maximum role mentions allowed
   * @param {number} config.maxEveryoneMentions - Maximum @everyone/@here mentions allowed
   * @returns {Promise<{triggered: boolean, reason?: string}>}
   */
  async check(message, config) {
    // Placeholder: full mass mention detection logic to be implemented
    return { triggered: false };
  },
};

module.exports = { massMentionsFilter };
