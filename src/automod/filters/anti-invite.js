/**
 * Anti Invite Filter
 * Detects and blocks Discord server invite links.
 * 
 * Filter interface:
 * - id: Unique identifier for the filter
 * - displayName: Human-readable name for UI
 * - defaultConfig: Default configuration options for this filter
 * - check: Async function that evaluates messages
 * 
 * @returns {{triggered: boolean, reason?: string}}
 */

const DISCORD_INVITE_PATTERN = /(?:https?:\/\/)?(?:www\.)?(?:discord(?:app)?\.(?:gg|io|me|li)|discord\.com\/invite)\/[a-zA-Z0-9-]+/gi;

const antiInviteFilter = {
  id: 'anti-invite',
  displayName: 'Anti Invite',
  defaultConfig: {
    allowBotInvites: false,
    allowAdminInvites: false,
  },

  /**
   * Checks if a message contains a Discord invite link.
   * @param {Message} message - Discord message object
   * @param {object} config - Filter configuration
   * @param {boolean} config.allowBotInvites - Whether to allow bots to post invites
   * @param {boolean} config.allowAdminInvites - Whether to allow admins to post invites
   * @returns {Promise<{triggered: boolean, reason?: string}>}
   */
  async check(message, config) {
    console.log(`[Anti-Invite Filter] Checking message ${message.id}, content: "${message.content}"`);
    const content = message.content;
    if (!content) {
      console.log(`[Anti-Invite Filter] No content, returning false`);
      return { triggered: false };
    }

    // Check if the message contains an invite pattern
    const matches = content.match(DISCORD_INVITE_PATTERN);
    if (!matches) {
      console.log(`[Anti-Invite Filter] No invite pattern matches, returning false`);
      return { triggered: false };
    }

    console.log(`[Anti-Invite Filter] Found invite matches: ${matches.join(', ')}`);

    // Check if user is allowed to post invites based on config
    if (config.allowAdminInvites) {
      const member = await message.guild.members.fetch(message.author.id).catch(() => null);
      if (member && member.permissions.has('Administrator')) {
        console.log(`[Anti-Invite Filter] User is admin, allowing invite`);
        return { triggered: false };
      }
    }

    if (config.allowBotInvites && message.author.bot) {
      console.log(`[Anti-Invite Filter] User is bot, allowing invite`);
      return { triggered: false };
    }

    console.log(`[Anti-Invite Filter] Invite detected, returning triggered=true`);
    return {
      triggered: true,
      reason: `Discord invite link detected: ${matches[0]}`,
    };
  },
};

module.exports = { antiInviteFilter };
