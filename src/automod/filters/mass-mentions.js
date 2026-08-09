/**
 * Mass Mentions Filter
 * Detects and blocks mass mention spam.
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
   * @param {Message} message - Discord message object
   * @param {object} config - Filter configuration
   * @param {number} config.maxUserMentions - Maximum user mentions allowed
   * @param {number} config.maxRoleMentions - Maximum role mentions allowed
   * @param {number} config.maxEveryoneMentions - Maximum @everyone/@here mentions allowed
   * @returns {Promise<{triggered: boolean, reason?: string}>}
   */
  async check(message, config) {
    const { maxUserMentions, maxRoleMentions, maxEveryoneMentions } = config;
    const reasons = [];

    // Check user mentions
    const userMentions = message.mentions.users.size;
    if (userMentions > maxUserMentions) {
      reasons.push(`${userMentions} user mentions (max: ${maxUserMentions})`);
    }

    // Check role mentions
    const roleMentions = message.mentions.roles.size;
    if (roleMentions > maxRoleMentions) {
      reasons.push(`${roleMentions} role mentions (max: ${maxRoleMentions})`);
    }

    // Check @everyone and @here
    const everyoneMentions = (message.mentions.everyone ? 1 : 0);
    if (everyoneMentions > maxEveryoneMentions) {
      reasons.push(`@everyone/@here mention (max: ${maxEveryoneMentions})`);
    }

    if (reasons.length > 0) {
      return {
        triggered: true,
        reason: `Mass mentions: ${reasons.join(', ')}`,
      };
    }

    return { triggered: false };
  },
};

module.exports = { massMentionsFilter };
