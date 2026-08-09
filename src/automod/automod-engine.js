const { antiInviteFilter } = require('./filters/anti-invite');
const { antiLinkFilter } = require('./filters/anti-link');
const { badWordsFilter } = require('./filters/bad-words');
const { spamFilter } = require('./filters/spam');
const { capsFilter } = require('./filters/caps');
const { massMentionsFilter } = require('./filters/mass-mentions');
const { aiModerationFilter } = require('./filters/ai-moderation');
const { heatFilter } = require('./filters/heat');
const { executeActions } = require('./automod-actions');
const { MessageCache } = require('./message-cache');

/**
 * AutoMod Engine
 * Evaluates enabled filters against messages and executes configured actions.
 * 
 * Processing flow:
 * 1. Skip DMs, bots, and messages without member data
 * 2. Check if AutoMod is enabled for the guild
 * 3. Check if channel or user is whitelisted
 * 4. Iterate through enabled filters in order
 * 5. Stop after first filter triggers (short-circuit evaluation)
 * 6. Execute configured actions for triggered filter
 */

// Registry of all available filters
// Order matters: filters are evaluated in this sequence
const FILTERS = [
  antiInviteFilter,
  antiLinkFilter,
  badWordsFilter,
  spamFilter,
  capsFilter,
  massMentionsFilter,
  aiModerationFilter,
  heatFilter,
];

// Global message cache instance for spam detection
// 60 second max age, 100 messages per user limit
const messageCache = new MessageCache(60000, 100);

/**
 * Processes a message through the AutoMod engine.
 * @param {Message} message - Discord message object
 * @param {AutoModStore} store - AutoMod store instance
 * @param {Client} client - Discord client
 */
async function processMessage(message, store, client) {
  console.log(`[AutoMod Engine] Processing message ${message.id}`);

  // Skip DMs, bots, and messages without member data
  if (!message.inGuild()) {
    console.log(`[AutoMod Engine] Skipping: Not in guild (DM)`);
    return;
  }
  if (message.author.bot) {
    console.log(`[AutoMod Engine] Skipping: Bot message`);
    return;
  }
  if (!message.member) {
    console.log(`[AutoMod Engine] Skipping: No member data`);
    return;
  }

  const guildId = message.guildId;
  const config = await store.getGuildConfig(guildId);
  console.log(`[AutoMod Engine] Guild config loaded: enabled=${config.enabled}, enabledFilters=[${Array.from(config.enabledFilters).join(', ')}]`);

  // Skip if AutoMod is disabled for this guild
  if (!config.enabled) {
    console.log(`[AutoMod Engine] Skipping: AutoMod disabled for guild ${guildId}`);
    return;
  }

  // Skip if channel is in ignore list
  if (config.ignoredChannels.has(message.channelId)) {
    console.log(`[AutoMod Engine] Skipping: Channel ${message.channelId} is ignored`);
    return;
  }

  // Skip if user has any ignored role
  const member = message.member;
  for (const roleId of config.ignoredRoles) {
    if (member.roles.cache.has(roleId)) {
      console.log(`[AutoMod Engine] Skipping: User has ignored role ${roleId}`);
      return;
    }
  }

  console.log(`[AutoMod Engine] Checking ${FILTERS.length} available filters`);
  // Iterate through enabled filters in order
  for (const filter of FILTERS) {
    if (!config.enabledFilters.has(filter.id)) {
      console.log(`[AutoMod Engine] Filter ${filter.id} is disabled, skipping`);
      continue;
    }

    console.log(`[AutoMod Engine] Checking filter: ${filter.id}`);
    const filterConfig = config.filterConfigs[filter.id] || filter.defaultConfig;
    // Pass messageCache to spam filter for history tracking
    const result = await filter.check(message, filterConfig, messageCache);
    console.log(`[AutoMod Engine] Filter ${filter.id} result: triggered=${result.triggered}, reason=${result.reason || 'none'}`);

    if (result.triggered) {
      // Filter triggered - execute actions and stop processing
      console.log(`[AutoMod Engine] Filter ${filter.id} TRIGGERED! Executing actions...`);
      await executeActions(message, config, filter, result, store, client);
      return;
    }
  }

  console.log(`[AutoMod Engine] No filters triggered, message allowed`);
}

/**
 * Gets all available filters.
 * @returns {Array<object>} Array of filter objects
 */
function getAvailableFilters() {
  return FILTERS;
}

/**
 * Gets a filter by ID.
 * @param {string} filterId - Filter identifier
 * @returns {object|null} Filter object or null if not found
 */
function getFilterById(filterId) {
  return FILTERS.find((f) => f.id === filterId) || null;
}

module.exports = {
  processMessage,
  getAvailableFilters,
  getFilterById,
};
