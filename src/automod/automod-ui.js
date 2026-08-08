const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} = require('discord.js');
const { COLORS, EMOJIS, EMOJI_IDS, brandedEmbed, NO_MENTIONS } = require('../brand');
const { getAvailableFilters } = require('./automod-engine');

/**
 * AutoMod UI Components
 * Generates dashboard embeds and button components.
 * 
 * All embeds follow the .analyze branding guidelines and include:
 * - Consistent color scheme
 * - Proper emoji usage
 * - Clear status indicators
 * - Guild name and version in footer
 */

/**
 * Creates a button component with consistent styling.
 * @param {string} customId - Button custom ID
 * @param {string} label - Button label
 * @param {ButtonStyle} style - Button style
 * @param {string} emojiId - Emoji ID from EMOJI_IDS
 * @param {boolean} disabled - Whether button is disabled
 * @returns {ButtonBuilder} Configured button builder
 */
function button(customId, label, style, emojiId, disabled = false) {
  return new ButtonBuilder()
    .setCustomId(customId)
    .setLabel(label)
    .setStyle(style)
    .setEmoji({ id: emojiId })
    .setDisabled(disabled);
}

/**
 * Generates the main dashboard embed.
 * @param {Interaction} interaction - Discord interaction
 * @param {object} config - Guild AutoMod configuration
 * @returns {EmbedBuilder} Dashboard embed
 */
function dashboardEmbed(interaction, config) {
  const filters = getAvailableFilters();
  const enabledFilters = filters.filter((f) => config.enabledFilters.has(f.id));
  const disabledFilters = filters.filter((f) => !config.enabledFilters.has(f.id));

  const statusEmoji = config.enabled ? EMOJIS.online : EMOJIS.question;
  const statusText = config.enabled ? 'Enabled' : 'Disabled';
  const statusColor = config.enabled ? COLORS.success : COLORS.neutral;

  const embed = brandedEmbed(interaction, {
    title: `${EMOJIS.database} AutoMod Dashboard`,
    description: `Manage your server's automated moderation filters and actions.`,
    color: COLORS.brand,
    fields: [
      {
        name: `${EMOJIS.online} STATUS`,
        value: `${statusEmoji} ${statusText}`,
        inline: true,
      },
      {
        name: `${EMOJIS.ticket} LOG CHANNEL`,
        value: config.logChannelId ? `<#${config.logChannelId}>` : '`Not configured`',
        inline: true,
      },
      {
        name: `${EMOJIS.people} IGNORED ROLES`,
        value: config.ignoredRoles.size > 0 ? `${config.ignoredRoles.size} role(s)` : '`None`',
        inline: true,
      },
      {
        name: `${EMOJIS.announce} IGNORED CHANNELS`,
        value: config.ignoredChannels.size > 0 ? `${config.ignoredChannels.size} channel(s)` : '`None`',
        inline: true,
      },
      {
        name: `${EMOJIS.database} ENABLED FILTERS (${enabledFilters.length})`,
        value: enabledFilters.length > 0
          ? enabledFilters.map((f) => `${EMOJIS.check} ${f.displayName}`).join('\n')
          : '`No filters enabled`',
        inline: false,
      },
      {
        name: `${EMOJIS.ticket} DISABLED FILTERS (${disabledFilters.length})`,
        value: disabledFilters.length > 0
          ? disabledFilters.map((f) => `${EMOJIS.question} ${f.displayName}`).join('\n')
          : '`All filters enabled`',
        inline: false,
      },
    ],
  });

  // Add footer with guild name and version
  if (interaction.inGuild()) {
    embed.setFooter({ 
      text: `${interaction.guild.name} • AutoMod v1.0`,
      iconURL: interaction.guild.iconURL({ size: 64 }) || undefined,
    });
  }

  return embed;
}

/**
 * Generates the main dashboard action row.
 * @returns {ActionRowBuilder} Dashboard button row
 */
function dashboardActions() {
  return new ActionRowBuilder().addComponents(
    button('automod:toggle', 'Toggle AutoMod', ButtonStyle.Primary, EMOJI_IDS.online),
    button('automod:modules', 'Modules', ButtonStyle.Secondary, EMOJI_IDS.database),
    button('automod:actions', 'Actions', ButtonStyle.Secondary, EMOJI_IDS.ticket),
    button('automod:antilink', 'Anti-Link', ButtonStyle.Secondary, EMOJI_IDS.database),
    button('automod:whitelist', 'Whitelist', ButtonStyle.Secondary, EMOJI_IDS.people),
  );
}

/**
 * Generates the dashboard second action row.
 * @returns {ActionRowBuilder} Dashboard second button row
 */
function dashboardActionsRow2() {
  return new ActionRowBuilder().addComponents(
    button('automod:antispam', 'Anti-Spam', ButtonStyle.Secondary, EMOJI_IDS.database),
    button('automod:logging', 'Logging', ButtonStyle.Secondary, EMOJI_IDS.announce),
  );
}

/**
 * Generates the modules selection embed.
 * @param {Interaction} interaction - Discord interaction
 * @param {object} config - Guild AutoMod configuration
 * @returns {EmbedBuilder} Modules embed
 */
function modulesEmbed(interaction, config) {
  const filters = getAvailableFilters();

  const embed = brandedEmbed(interaction, {
    title: `${EMOJIS.database} AutoMod Modules`,
    description: 'Select a module from the dropdown below to enable or disable it.',
    color: COLORS.brand,
    fields: filters.map((filter) => ({
      name: `${config.enabledFilters.has(filter.id) ? EMOJIS.check : EMOJIS.question} ${filter.displayName}`,
      value: config.enabledFilters.has(filter.id) ? '`Enabled`' : '`Disabled`',
      inline: true,
    })),
  });

  if (interaction.inGuild()) {
    embed.setFooter({ text: `${interaction.guild.name} • AutoMod v1.0` });
  }

  return embed;
}

/**
 * Generates the modules action row.
 * @returns {ActionRowBuilder} Modules button row
 */
function modulesActions() {
  return new ActionRowBuilder().addComponents(
    button('automod:modules-back', '← Back', ButtonStyle.Secondary, EMOJI_IDS.check),
  );
}

/**
 * Generates the actions configuration embed.
 * @param {Interaction} interaction - Discord interaction
 * @param {object} config - Guild AutoMod configuration
 * @returns {EmbedBuilder} Actions embed
 */
function actionsEmbed(interaction, config) {
  const embed = brandedEmbed(interaction, {
    title: `${EMOJIS.ticket} AutoMod Actions`,
    description: 'Configure what happens when a filter triggers.',
    color: COLORS.brand,
    fields: [
      {
        name: `${EMOJIS.check} DELETE MESSAGE`,
        value: config.actions.delete ? `${EMOJIS.online} Enabled` : `${EMOJIS.question} Disabled`,
        inline: true,
      },
      {
        name: `${EMOJIS.question} WARN USER`,
        value: config.actions.warn ? `${EMOJIS.online} Enabled` : `${EMOJIS.question} Disabled`,
        inline: true,
      },
      {
        name: `${EMOJIS.ticket} TIMEOUT`,
        value: config.actions.timeout?.enabled 
          ? `${EMOJIS.online} Enabled (${Math.floor(config.actions.timeout.duration / 1000)}s)`
          : `${EMOJIS.question} Disabled`,
        inline: true,
      },
      {
        name: `${EMOJIS.people} KICK USER`,
        value: config.actions.kick ? `${EMOJIS.online} Enabled` : `${EMOJIS.question} Disabled`,
        inline: true,
      },
      {
        name: `${EMOJIS.ticket} BAN USER`,
        value: config.actions.ban ? `${EMOJIS.online} Enabled` : `${EMOJIS.question} Disabled`,
        inline: true,
      },
    ],
  });

  if (interaction.inGuild()) {
    embed.setFooter({ text: `${interaction.guild.name} • AutoMod v1.0` });
  }

  return embed;
}

/**
 * Generates the actions action row.
 * @returns {ActionRowBuilder} Actions button row
 */
function actionsActions() {
  return new ActionRowBuilder().addComponents(
    button('automod:actions-delete', 'Delete', ButtonStyle.Secondary, EMOJI_IDS.check),
    button('automod:actions-warn', 'Warn', ButtonStyle.Secondary, EMOJI_IDS.question),
    button('automod:actions-timeout', 'Timeout', ButtonStyle.Secondary, EMOJI_IDS.ticket),
    button('automod:actions-kick', 'Kick', ButtonStyle.Danger, EMOJI_IDS.people),
    button('automod:actions-ban', 'Ban', ButtonStyle.Danger, EMOJI_IDS.ticket),
  );
}

/**
 * Generates the actions back button row.
 * @returns {ActionRowBuilder} Actions back button row
 */
function actionsBackRow() {
  return new ActionRowBuilder().addComponents(
    button('automod:actions-back', '← Back', ButtonStyle.Secondary, EMOJI_IDS.check),
  );
}

/**
 * Generates the whitelist configuration embed.
 * @param {Interaction} interaction - Discord interaction
 * @param {object} config - Guild AutoMod configuration
 * @returns {EmbedBuilder} Whitelist embed
 */
function whitelistEmbed(interaction, config) {
  const embed = brandedEmbed(interaction, {
    title: `${EMOJIS.people} AutoMod Whitelist`,
    description: 'Configure roles and channels ignored by AutoMod.',
    color: COLORS.brand,
    fields: [
      {
        name: `${EMOJIS.people} IGNORED ROLES`,
        value: config.ignoredRoles.size > 0
          ? Array.from(config.ignoredRoles).map((id) => `<@&${id}>`).join(', ')
          : '`No ignored roles`',
        inline: false,
      },
      {
        name: `${EMOJIS.announce} IGNORED CHANNELS`,
        value: config.ignoredChannels.size > 0
          ? Array.from(config.ignoredChannels).map((id) => `<#${id}>`).join(', ')
          : '`No ignored channels`',
        inline: false,
      },
    ],
  });

  if (interaction.inGuild()) {
    embed.setFooter({ text: `${interaction.guild.name} • AutoMod v1.0` });
  }

  return embed;
}

/**
 * Generates the whitelist action row.
 * @returns {ActionRowBuilder} Whitelist button row
 */
function whitelistActions() {
  return new ActionRowBuilder().addComponents(
    button('automod:whitelist-add-role', 'Add Role', ButtonStyle.Secondary, EMOJI_IDS.people),
    button('automod:whitelist-add-channel', 'Add Channel', ButtonStyle.Secondary, EMOJI_IDS.announce),
    button('automod:whitelist-back', '← Back', ButtonStyle.Secondary, EMOJI_IDS.check),
  );
}

/**
 * Generates the logging configuration embed.
 * @param {Interaction} interaction - Discord interaction
 * @param {object} config - Guild AutoMod configuration
 * @returns {EmbedBuilder} Logging embed
 */
function loggingEmbed(interaction, config) {
  const embed = brandedEmbed(interaction, {
    title: `${EMOJIS.announce} AutoMod Logging`,
    description: 'Configure the channel where AutoMod actions are logged.',
    color: COLORS.brand,
    fields: [
      {
        name: `${EMOJIS.announce} LOG CHANNEL`,
        value: config.logChannelId ? `<#${config.logChannelId}>` : '`Not configured`',
        inline: true,
      },
    ],
  });

  if (interaction.inGuild()) {
    embed.setFooter({ text: `${interaction.guild.name} • AutoMod v1.0` });
  }

  return embed;
}

/**
 * Generates the logging action row.
 * @returns {ActionRowBuilder} Logging button row
 */
function loggingActions() {
  return new ActionRowBuilder().addComponents(
    button('automod:logging-set', 'Set Channel', ButtonStyle.Secondary, EMOJI_IDS.announce),
    button('automod:logging-clear', 'Clear', ButtonStyle.Danger, EMOJI_IDS.ticket),
    button('automod:logging-back', '← Back', ButtonStyle.Secondary, EMOJI_IDS.check),
  );
}

/**
 * Generates the Anti-Link configuration embed.
 * @param {Interaction} interaction - Discord interaction
 * @param {object} config - Guild AutoMod configuration
 * @returns {EmbedBuilder} Anti-Link embed
 */
function antiLinkEmbed(interaction, config) {
  const antiLinkConfig = config.filterConfigs['anti-link'] || {};
  const whitelist = antiLinkConfig.allowWhitelistedDomains || [];
  
  const embed = brandedEmbed(interaction, {
    title: `${EMOJIS.link} Anti-Link Configuration`,
    description: 'Configure the Anti-Link filter to block external URLs.',
    color: COLORS.brand,
    fields: [
      {
        name: `${EMOJIS.check} STATUS`,
        value: config.enabledFilters.has('anti-link') ? `${EMOJIS.online} Enabled` : `${EMOJIS.question} Disabled`,
        inline: true,
      },
      {
        name: `${EMOJIS.people} ALLOW ADMINS`,
        value: antiLinkConfig.allowAdminLinks ? `${EMOJIS.online} Enabled` : `${EMOJIS.question} Disabled`,
        inline: true,
      },
      {
        name: `${EMOJIS.database} ALLOW BOTS`,
        value: antiLinkConfig.allowBotLinks ? `${EMOJIS.online} Enabled` : `${EMOJIS.question} Disabled`,
        inline: true,
      },
      {
        name: `${EMOJIS.link} WHITELISTED DOMAINS`,
        value: whitelist.length > 0 
          ? whitelist.map((d) => `• ${d}`).join('\n')
          : '`No whitelisted domains`',
        inline: false,
      },
    ],
  });

  if (interaction.inGuild()) {
    embed.setFooter({ text: `${interaction.guild.name} • AutoMod v1.0` });
  }

  return embed;
}

/**
 * Generates the Anti-Link action row.
 * @returns {ActionRowBuilder} Anti-Link button row
 */
function antiLinkActions() {
  return new ActionRowBuilder().addComponents(
    button('automod:antilink-toggle', 'Toggle Module', ButtonStyle.Primary, EMOJI_IDS.online),
    button('automod:antilink-admins', 'Toggle Admins', ButtonStyle.Secondary, EMOJI_IDS.people),
    button('automod:antilink-bots', 'Toggle Bots', ButtonStyle.Secondary, EMOJI_IDS.database),
    button('automod:antilink-add-domain', 'Add Domain', ButtonStyle.Secondary, EMOJI_IDS.database),
    button('automod:antilink-back', '← Back', ButtonStyle.Secondary, EMOJI_IDS.check),
  );
}

/**
 * Generates the Anti-Spam configuration embed.
 * @param {Interaction} interaction - Discord interaction
 * @param {object} config - Guild AutoMod configuration
 * @returns {EmbedBuilder} Anti-Spam embed
 */
function antiSpamEmbed(interaction, config) {
  const spamConfig = config.filterConfigs['spam'] || {};
  
  const embed = brandedEmbed(interaction, {
    title: `${EMOJIS.database} Anti-Spam Configuration`,
    description: 'Configure the Anti-Spam filter to detect and block various types of spam.',
    color: COLORS.brand,
    fields: [
      {
        name: `${EMOJIS.check} STATUS`,
        value: config.enabledFilters.has('spam') ? `${EMOJIS.online} Enabled` : `${EMOJIS.question} Disabled`,
        inline: true,
      },
      {
        name: `${EMOJIS.ticket} MESSAGE LIMIT`,
        value: `${spamConfig.maxMessagesPerWindow || 5} / ${(spamConfig.timeWindowMs || 10000) / 1000}s`,
        inline: true,
      },
      {
        name: `${EMOJIS.database} DUPLICATE LIMIT`,
        value: `${spamConfig.maxDuplicateMessages || 3}`,
        inline: true,
      },
      {
        name: `${EMOJIS.people} IGNORE BOTS`,
        value: spamConfig.ignoreBots !== false ? `${EMOJIS.online} Enabled` : `${EMOJIS.question} Disabled`,
        inline: true,
      },
      {
        name: `${EMOJIS.ticket} IGNORE ADMINS`,
        value: spamConfig.ignoreAdmins !== false ? `${EMOJIS.online} Enabled` : `${EMOJIS.question} Disabled`,
        inline: true,
      },
      {
        name: `${EMOJIS.announce} CHARACTER LIMIT`,
        value: `${spamConfig.maxConsecutiveChars || 10}`,
        inline: true,
      },
      {
        name: `${EMOJIS.link} EMOJI LIMIT`,
        value: `${spamConfig.maxEmojis || 10}`,
        inline: true,
      },
      {
        name: `${EMOJIS.database} LINE LIMIT`,
        value: `${spamConfig.maxLines || 10}`,
        inline: true,
      },
      {
        name: `${EMOJIS.people} WORD REPETITION`,
        value: `${spamConfig.maxWordRepetition || 5}`,
        inline: true,
      },
    ],
  });

  if (interaction.inGuild()) {
    embed.setFooter({ text: `${interaction.guild.name} • AutoMod v1.0` });
  }

  return embed;
}

/**
 * Generates the Anti-Spam action row.
 * @returns {ActionRowBuilder} Anti-Spam button row
 */
function antiSpamActions() {
  return new ActionRowBuilder().addComponents(
    button('automod:antispam-toggle', 'Toggle Module', ButtonStyle.Primary, EMOJI_IDS.online),
    button('automod:antispam-bots', 'Toggle Bots', ButtonStyle.Secondary, EMOJI_IDS.database),
    button('automod:antispam-admins', 'Toggle Admins', ButtonStyle.Secondary, EMOJI_IDS.people),
    button('automod:antispam-thresholds', 'Thresholds', ButtonStyle.Secondary, EMOJI_IDS.ticket),
    button('automod:antispam-back', '← Back', ButtonStyle.Secondary, EMOJI_IDS.check),
  );
}

module.exports = {
  dashboardEmbed,
  dashboardActions,
  dashboardActionsRow2,
  modulesEmbed,
  modulesActions,
  actionsEmbed,
  actionsActions,
  actionsBackRow,
  whitelistEmbed,
  whitelistActions,
  loggingEmbed,
  loggingActions,
  antiLinkEmbed,
  antiLinkActions,
  antiSpamEmbed,
  antiSpamActions,
};
