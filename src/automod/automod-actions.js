const { COLORS, EMOJIS, brandedEmbed, NO_MENTIONS } = require('../brand');
const { AutoModLogger } = require('./automod-logger');

/**
 * AutoMod Actions
 * Executes configured actions when a filter triggers.
 * 
 * Supported actions:
 * - Delete message: Removes the offending message
 * - Warn user: Sends a DM warning to the user
 * - Timeout user: Applies a Discord timeout to the user
 * - Kick user: Kicks the user from the server
 * - Ban user: Bans the user from the server
 * 
 * All actions are executed sequentially and failures are logged but don't
 * prevent other actions from running.
 */

const logger = new AutoModLogger();

/**
 * Executes configured actions for a triggered filter.
 * @param {Message} message - Discord message object
 * @param {object} config - Guild AutoMod configuration
 * @param {object} filter - Filter that triggered
 * @param {object} result - Filter check result
 * @param {AutoModStore} store - AutoMod store instance (unused, kept for interface consistency)
 * @param {Client} client - Discord client
 */
async function executeActions(message, config, filter, result, store, client) {
  const actionsTaken = [];

  // Delete message if configured
  if (config.actions.delete) {
    try {
      await message.delete();
      actionsTaken.push('Message deleted');
    } catch (error) {
      console.error(`Failed to delete message ${message.id}:`, error.message);
    }
  }

  // Warn user if configured
  if (config.actions.warn) {
    try {
      const warningEmbed = brandedEmbed({ client }, {
        title: `${EMOJIS.question} AutoMod Warning`,
        description: `Your message was flagged by the **${filter.displayName}** filter.\n\n**Reason:** ${result.reason}`,
        color: COLORS.warning,
      });
      await message.author.send({ embeds: [warningEmbed], allowedMentions: NO_MENTIONS }).catch(() => null);
      actionsTaken.push('User warned via DM');
    } catch (error) {
      console.error(`Failed to warn user ${message.author.id}:`, error.message);
    }
  }

  // Timeout user if configured
  if (config.actions.timeout?.enabled && config.actions.timeout.duration) {
    try {
      const durationMs = config.actions.timeout.duration;
      await message.member.timeout(durationMs, `AutoMod: ${filter.displayName} filter triggered`);
      actionsTaken.push(`User timed out for ${durationMs}ms`);
    } catch (error) {
      console.error(`Failed to timeout user ${message.author.id}:`, error.message);
    }
  }

  // Kick user if configured
  if (config.actions.kick) {
    try {
      await message.member.kick(`AutoMod: ${filter.displayName} filter triggered`);
      actionsTaken.push('User kicked');
    } catch (error) {
      console.error(`Failed to kick user ${message.author.id}:`, error.message);
    }
  }

  // Ban user if configured
  if (config.actions.ban) {
    try {
      await message.member.ban({ reason: `AutoMod: ${filter.displayName} filter triggered` });
      actionsTaken.push('User banned');
    } catch (error) {
      console.error(`Failed to ban user ${message.author.id}:`, error.message);
    }
  }

  // Log the trigger with all actions taken
  await logger.logTrigger(client, message.guildId, config.logChannelId, {
    filterName: filter.displayName,
    userId: message.author.id,
    userName: message.author.tag,
    channelId: message.channelId,
    messageContent: message.content,
    detectedUrl: result.detectedUrl || null,
    spamType: result.spamType || null,
    details: result.details || null,
    actionTaken: actionsTaken.join(', ') || 'None',
  });
}

module.exports = { executeActions };
