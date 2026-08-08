const { COLORS, EMOJIS, brandedEmbed, NO_MENTIONS } = require('../brand');

/**
 * Logs AutoMod actions to a configured guild channel.
 * Provides detailed audit trail for moderation actions.
 * 
 * Handles:
 * - Filter trigger events (when a filter catches a message)
 * - Configuration changes (when settings are modified)
 * - Gracefully handles missing/deleted log channels
 */
class AutoModLogger {
  constructor() {
    // No instance state needed - logger is stateless
  }

  /**
   * Logs a filter trigger to the guild's log channel.
   * @param {Client} client - Discord client
   * @param {string} guildId - Guild ID for error logging
   * @param {string|null} logChannelId - Channel ID to log to, or null to skip
   * @param {object} event - Event details
   * @param {string} event.filterName - Name of the filter that triggered
   * @param {string} event.userId - User ID who triggered the filter
   * @param {string} event.userName - Username/tag of the user
   * @param {string} event.channelId - Channel where the trigger occurred
   * @param {string} [event.messageContent] - Content of the message (truncated to 500 chars)
   * @param {string} [event.detectedUrl] - Detected URL (for Anti-Link filter)
   * @param {string} [event.spamType] - Type of spam detected (for Anti-Spam filter)
   * @param {object} [event.details] - Additional details object (thresholds, counts, etc.)
   * @param {string} [event.actionTaken] - Actions taken (e.g., "Message deleted, User warned")
   */
  async logTrigger(client, guildId, logChannelId, event) {
    if (!logChannelId) return;

    try {
      const channel = await client.channels.fetch(logChannelId).catch(() => null);
      if (!channel || !channel.isTextBased()) {
        console.warn(`AutoMod log channel ${logChannelId} not accessible for guild ${guildId}`);
        return;
      }

      const fields = [
        { name: `${EMOJIS.people} User`, value: `<@${event.userId}>\n\`${event.userName}\``, inline: true },
        { name: `${EMOJIS.database} Filter`, value: event.filterName, inline: true },
        { name: `${EMOJIS.ticket} Action`, value: event.actionTaken || 'None', inline: true },
        { name: `${EMOJIS.announce} Message`, value: event.messageContent?.slice(0, 500) || '[No content]', inline: false },
      ];

      // Add detected URL field if present (for Anti-Link filter)
      if (event.detectedUrl) {
        fields.splice(3, 0, { name: `${EMOJIS.link} Detected URL`, value: event.detectedUrl, inline: false });
      }

      // Add spam-specific fields if present (for Anti-Spam filter)
      if (event.spamType) {
        const spamTypeLabels = {
          rapid_spam: 'Rapid Message Spam',
          duplicate_spam: 'Duplicate Message Spam',
          near_duplicate_spam: 'Near-Duplicate Spam',
          character_spam: 'Character Repetition',
          emoji_spam: 'Emoji Spam',
          line_spam: 'Line Spam',
          word_repetition_spam: 'Word Repetition',
        };
        fields.splice(3, 0, { 
          name: `${EMOJIS.database} Spam Type`, 
          value: spamTypeLabels[event.spamType] || event.spamType, 
          inline: true 
        });

        // Add details if present
        if (event.details) {
          const detailParts = [];
          if (event.details.messageCount !== undefined) {
            detailParts.push(`Messages: ${event.details.messageCount}`);
          }
          if (event.details.threshold !== undefined) {
            detailParts.push(`Threshold: ${event.details.threshold}`);
          }
          if (event.details.timeWindowMs !== undefined) {
            detailParts.push(`Window: ${event.details.timeWindowMs / 1000}s`);
          }
          if (event.details.duplicateCount !== undefined) {
            detailParts.push(`Duplicates: ${event.details.duplicateCount}`);
          }
          if (event.details.nearDuplicateCount !== undefined) {
            detailParts.push(`Near-Duplicates: ${event.details.nearDuplicateCount}`);
          }
          if (event.details.similarityThreshold !== undefined) {
            detailParts.push(`Similarity: ${(event.details.similarityThreshold * 100).toFixed(0)}%`);
          }
          if (event.details.maxConsecutive !== undefined) {
            detailParts.push(`Consecutive Chars: ${event.details.maxConsecutive}`);
          }
          if (event.details.emojiCount !== undefined) {
            detailParts.push(`Emojis: ${event.details.emojiCount}`);
          }
          if (event.details.lineCount !== undefined) {
            detailParts.push(`Lines: ${event.details.lineCount}`);
          }
          if (event.details.maxRepetition !== undefined) {
            detailParts.push(`Word Repetition: ${event.details.maxRepetition}`);
          }

          if (detailParts.length > 0) {
            fields.splice(4, 0, { 
              name: `${EMOJIS.ticket} Details`, 
              value: detailParts.join(' | '), 
              inline: false 
            });
          }
        }
      }

      const embed = brandedEmbed({ client }, {
        title: `${EMOJIS.database} AutoMod Trigger`,
        description: `Filter **${event.filterName}** was triggered by **${event.userName}** in <#${event.channelId}>.`,
        color: COLORS.warning,
        fields,
        timestamp: new Date(),
      });

      await channel.send({ embeds: [embed], allowedMentions: NO_MENTIONS });
    } catch (error) {
      console.error(`Failed to log AutoMod trigger for guild ${guildId}:`, error.message);
    }
  }

  /**
   * Logs a configuration change to the guild's log channel.
   * @param {Client} client - Discord client
   * @param {string} guildId - Guild ID for error logging
   * @param {string|null} logChannelId - Channel ID to log to, or null to skip
   * @param {object} event - Event details
   * @param {string} event.actorId - User ID who made the change
   * @param {string} event.actorName - Username/tag of the actor
   * @param {string} event.changeType - Type of change (e.g., "Toggle AutoMod", "Toggle Module")
   * @param {string} [event.details] - Additional details about the change
   */
  async logConfigChange(client, guildId, logChannelId, event) {
    if (!logChannelId) return;

    try {
      const channel = await client.channels.fetch(logChannelId).catch(() => null);
      if (!channel || !channel.isTextBased()) {
        console.warn(`AutoMod log channel ${logChannelId} not accessible for guild ${guildId}`);
        return;
      }

      const embed = brandedEmbed({ client }, {
        title: `${EMOJIS.database} AutoMod Configuration Changed`,
        description: `**${event.actorName}** modified AutoMod settings.`,
        color: COLORS.brand,
        fields: [
          { name: `${EMOJIS.people} Modified by`, value: `<@${event.actorId}>`, inline: true },
          { name: `${EMOJIS.ticket} Change`, value: event.changeType, inline: true },
          { name: `${EMOJIS.announce} Details`, value: event.details || 'No details provided', inline: false },
        ],
      });

      await channel.send({ embeds: [embed], allowedMentions: NO_MENTIONS });
    } catch (error) {
      console.error(`Failed to log AutoMod config change for guild ${guildId}:`, error.message);
    }
  }
}

module.exports = { AutoModLogger };
