const {
  SlashCommandBuilder,
  PermissionFlagsBits,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  ActionRowBuilder,
} = require('discord.js');
const { COLORS, EMOJIS, brandedEmbed, noticeEmbed, NO_MENTIONS } = require('../brand');
const { AutoModLogger } = require('./automod-logger');
const {
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
} = require('./automod-ui');
const { getAvailableFilters, getFilterById } = require('./automod-engine');

/**
 * AutoMod Command
 * Provides an interactive dashboard for managing AutoMod settings.
 * 
 * Interaction handling:
 * - All interactions are acknowledged within Discord's 3-second timeout
 * - Uses update() for button interactions to prevent duplicate replies
 * - Gracefully handles deleted messages/channels
 * - Logs interaction failures for debugging
 */

const logger = new AutoModLogger();

const automodCommand = new SlashCommandBuilder()
  .setName('automod')
  .setDescription('Manage AutoMod automated moderation settings.')
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
  .setDMPermission(false);

/**
 * Handles the /automod slash command.
 * @param {Interaction} interaction - Discord interaction
 * @param {AutoModStore} store - AutoMod store instance
 */
async function handleAutomodCommand(interaction, store) {
  try {
    if (!interaction.inGuild()) {
      await interaction.reply({
        embeds: [noticeEmbed(interaction, {
          title: 'Server-only command',
          description: 'AutoMod can only be configured within a server.',
          color: COLORS.neutral,
        })],
        ephemeral: true,
        allowedMentions: NO_MENTIONS,
      });
      return;
    }

    const config = await store.getGuildConfig(interaction.guildId);

    await interaction.reply({
      embeds: [dashboardEmbed(interaction, config)],
      components: [dashboardActions(), dashboardActionsRow2()],
      ephemeral: true,
      allowedMentions: NO_MENTIONS,
    });
  } catch (error) {
    console.error('handleAutomodCommand failed:', error);
    console.error('Full stack trace:', error.stack);
    const reply = {
      embeds: [noticeEmbed(interaction, {
        title: 'Dashboard Error',
        description: 'Failed to load AutoMod dashboard. Please try again.',
        color: COLORS.danger,
      })],
      ephemeral: true,
      allowedMentions: NO_MENTIONS,
    };
    if (interaction.deferred || interaction.replied) await interaction.editReply(reply).catch(() => null);
    else await interaction.reply(reply).catch(() => null);
  }
}

/**
 * Handles AutoMod button interactions.
 * @param {Interaction} interaction - Discord interaction
 * @param {AutoModStore} store - AutoMod store instance
 * @returns {Promise<boolean>} True if interaction was handled, false otherwise
 */
async function handleAutomodInteraction(interaction, store) {
  try {
    if (!interaction.isButton() || !interaction.customId.startsWith('automod:')) return false;

    // Check if interaction was already replied to (prevents duplicate replies)
    if (interaction.replied || interaction.deferred) return false;

    const config = await store.getGuildConfig(interaction.guildId);
    const action = interaction.customId;

  if (action === 'automod:toggle') {
    const newEnabled = !config.enabled;
    await store.updateGuildConfig(interaction.guildId, { enabled: newEnabled });
    await logger.logConfigChange(interaction.client, interaction.guildId, config.logChannelId, {
      actorId: interaction.user.id,
      actorName: interaction.user.tag,
      changeType: 'Toggle AutoMod',
      details: newEnabled ? 'Enabled' : 'Disabled',
    });
    await interaction.update({
      embeds: [dashboardEmbed(interaction, { ...config, enabled: newEnabled })],
      components: [dashboardActions(), dashboardActionsRow2()],
      allowedMentions: NO_MENTIONS,
    }).catch((error) => {
      console.error(`Failed to update automod:toggle interaction:`, error.message);
    });
    return true;
  }

  if (action === 'automod:modules') {
    await interaction.update({
      embeds: [modulesEmbed(interaction, config)],
      components: [modulesActions(), createModulesSelectMenu(config)],
      allowedMentions: NO_MENTIONS,
    }).catch((error) => {
      console.error(`Failed to update automod:modules interaction:`, error.message);
    });
    return true;
  }

  if (action === 'automod:actions') {
    await interaction.update({
      embeds: [actionsEmbed(interaction, config)],
      components: [actionsActions(), actionsBackRow()],
      allowedMentions: NO_MENTIONS,
    }).catch((error) => {
      console.error(`Failed to update automod:actions interaction:`, error.message);
    });
    return true;
  }

  if (action === 'automod:whitelist') {
    await interaction.update({
      embeds: [whitelistEmbed(interaction, config)],
      components: [whitelistActions()],
      allowedMentions: NO_MENTIONS,
    }).catch((error) => {
      console.error(`Failed to update automod:whitelist interaction:`, error.message);
    });
    return true;
  }

  if (action === 'automod:antilink') {
    await interaction.update({
      embeds: [antiLinkEmbed(interaction, config)],
      components: [antiLinkActions()],
      allowedMentions: NO_MENTIONS,
    }).catch((error) => {
      console.error(`Failed to update automod:antilink interaction:`, error.message);
    });
    return true;
  }

  if (action === 'automod:antispam') {
    await interaction.update({
      embeds: [antiSpamEmbed(interaction, config)],
      components: [antiSpamActions()],
      allowedMentions: NO_MENTIONS,
    }).catch((error) => {
      console.error(`Failed to update automod:antispam interaction:`, error.message);
    });
    return true;
  }

  if (action === 'automod:logging') {
    await interaction.update({
      embeds: [loggingEmbed(interaction, config)],
      components: [loggingActions()],
      allowedMentions: NO_MENTIONS,
    }).catch((error) => {
      console.error(`Failed to update automod:logging interaction:`, error.message);
    });
    return true;
  }

  if (action === 'automod:modules-back') {
    await interaction.update({
      embeds: [dashboardEmbed(interaction, config)],
      components: [dashboardActions(), dashboardActionsRow2()],
      allowedMentions: NO_MENTIONS,
    }).catch((error) => {
      console.error(`Failed to update automod:modules-back interaction:`, error.message);
    });
    return true;
  }

  if (action === 'automod:actions-delete') {
    const newDelete = !config.actions.delete;
    await store.setAction(interaction.guildId, 'delete', newDelete);
    await logger.logConfigChange(interaction.client, interaction.guildId, config.logChannelId, {
      actorId: interaction.user.id,
      actorName: interaction.user.tag,
      changeType: 'Toggle Delete Action',
      details: newDelete ? 'Enabled' : 'Disabled',
    });
    await interaction.update({
      embeds: [actionsEmbed(interaction, { ...config, actions: { ...config.actions, delete: newDelete } })],
      components: [actionsActions(), actionsBackRow()],
      allowedMentions: NO_MENTIONS,
    }).catch((error) => {
      console.error(`Failed to update automod:actions-delete interaction:`, error.message);
    });
    return true;
  }

  if (action === 'automod:actions-warn') {
    const newWarn = !config.actions.warn;
    await store.setAction(interaction.guildId, 'warn', newWarn);
    await logger.logConfigChange(interaction.client, interaction.guildId, config.logChannelId, {
      actorId: interaction.user.id,
      actorName: interaction.user.tag,
      changeType: 'Toggle Warn Action',
      details: newWarn ? 'Enabled' : 'Disabled',
    });
    await interaction.update({
      embeds: [actionsEmbed(interaction, { ...config, actions: { ...config.actions, warn: newWarn } })],
      components: [actionsActions(), actionsBackRow()],
      allowedMentions: NO_MENTIONS,
    }).catch((error) => {
      console.error(`Failed to update automod:actions-warn interaction:`, error.message);
    });
    return true;
  }

  if (action === 'automod:actions-timeout') {
    const newTimeout = !config.actions.timeout?.enabled;
    await store.setAction(interaction.guildId, 'timeout', {
      enabled: newTimeout,
      duration: newTimeout ? 60000 : null, // Default 1 minute
    });
    await logger.logConfigChange(interaction.client, interaction.guildId, config.logChannelId, {
      actorId: interaction.user.id,
      actorName: interaction.user.tag,
      changeType: 'Toggle Timeout Action',
      details: newTimeout ? 'Enabled (1 minute)' : 'Disabled',
    });
    await interaction.update({
      embeds: [actionsEmbed(interaction, {
        ...config,
        actions: { ...config.actions, timeout: { enabled: newTimeout, duration: newTimeout ? 60000 : null } },
      })],
      components: [actionsActions(), actionsBackRow()],
      allowedMentions: NO_MENTIONS,
    }).catch((error) => {
      console.error(`Failed to update automod:actions-timeout interaction:`, error.message);
    });
    return true;
  }

  if (action === 'automod:actions-kick') {
    const newKick = !config.actions.kick;
    await store.setAction(interaction.guildId, 'kick', newKick);
    await logger.logConfigChange(interaction.client, interaction.guildId, config.logChannelId, {
      actorId: interaction.user.id,
      actorName: interaction.user.tag,
      changeType: 'Toggle Kick Action',
      details: newKick ? 'Enabled' : 'Disabled',
    });
    await interaction.update({
      embeds: [actionsEmbed(interaction, { ...config, actions: { ...config.actions, kick: newKick } })],
      components: [actionsActions(), actionsBackRow()],
      allowedMentions: NO_MENTIONS,
    }).catch((error) => {
      console.error(`Failed to update automod:actions-kick interaction:`, error.message);
    });
    return true;
  }

  if (action === 'automod:actions-ban') {
    const newBan = !config.actions.ban;
    await store.setAction(interaction.guildId, 'ban', newBan);
    await logger.logConfigChange(interaction.client, interaction.guildId, config.logChannelId, {
      actorId: interaction.user.id,
      actorName: interaction.user.tag,
      changeType: 'Toggle Ban Action',
      details: newBan ? 'Enabled' : 'Disabled',
    });
    await interaction.update({
      embeds: [actionsEmbed(interaction, { ...config, actions: { ...config.actions, ban: newBan } })],
      components: [actionsActions(), actionsBackRow()],
      allowedMentions: NO_MENTIONS,
    }).catch((error) => {
      console.error(`Failed to update automod:actions-ban interaction:`, error.message);
    });
    return true;
  }

  if (action === 'automod:actions-back') {
    await interaction.update({
      embeds: [dashboardEmbed(interaction, config)],
      components: [dashboardActions(), dashboardActionsRow2()],
      allowedMentions: NO_MENTIONS,
    }).catch((error) => {
      console.error(`Failed to update automod:actions-back interaction:`, error.message);
    });
    return true;
  }

  if (action === 'automod:whitelist-back') {
    await interaction.update({
      embeds: [dashboardEmbed(interaction, config)],
      components: [dashboardActions(), dashboardActionsRow2()],
      allowedMentions: NO_MENTIONS,
    }).catch((error) => {
      console.error(`Failed to update automod:whitelist-back interaction:`, error.message);
    });
    return true;
  }

  if (action === 'automod:logging-back') {
    await interaction.update({
      embeds: [dashboardEmbed(interaction, config)],
      components: [dashboardActions(), dashboardActionsRow2()],
      allowedMentions: NO_MENTIONS,
    }).catch((error) => {
      console.error(`Failed to update automod:logging-back interaction:`, error.message);
    });
    return true;
  }

  if (action === 'automod:logging-clear') {
    await store.setLogChannel(interaction.guildId, null);
    await logger.logConfigChange(interaction.client, interaction.guildId, config.logChannelId, {
      actorId: interaction.user.id,
      actorName: interaction.user.tag,
      changeType: 'Clear Log Channel',
      details: 'Log channel cleared',
    });
    await interaction.update({
      embeds: [loggingEmbed(interaction, { ...config, logChannelId: null })],
      components: [loggingActions()],
      allowedMentions: NO_MENTIONS,
    }).catch((error) => {
      console.error(`Failed to update automod:logging-clear interaction:`, error.message);
    });
    return true;
  }

  // Anti-Link configuration handlers
  if (action === 'automod:antilink-toggle') {
    const isEnabled = config.enabledFilters.has('anti-link');
    await store.setFilterEnabled(interaction.guildId, 'anti-link', !isEnabled);
    await logger.logConfigChange(interaction.client, interaction.guildId, config.logChannelId, {
      actorId: interaction.user.id,
      actorName: interaction.user.tag,
      changeType: 'Toggle Anti-Link Module',
      details: !isEnabled ? 'Enabled' : 'Disabled',
    });
    const newConfig = await store.getGuildConfig(interaction.guildId);
    await interaction.update({
      embeds: [antiLinkEmbed(interaction, newConfig)],
      components: [antiLinkActions()],
      allowedMentions: NO_MENTIONS,
    }).catch((error) => {
      console.error(`Failed to update automod:antilink-toggle interaction:`, error.message);
    });
    return true;
  }

  if (action === 'automod:antilink-admins') {
    const antiLinkConfig = config.filterConfigs['anti-link'] || {};
    const newAllowAdmins = !antiLinkConfig.allowAdminLinks;
    await store.setFilterConfig(interaction.guildId, 'anti-link', {
      ...antiLinkConfig,
      allowAdminLinks: newAllowAdmins,
    });
    await logger.logConfigChange(interaction.client, interaction.guildId, config.logChannelId, {
      actorId: interaction.user.id,
      actorName: interaction.user.tag,
      changeType: 'Toggle Admin Bypass',
      details: newAllowAdmins ? 'Enabled' : 'Disabled',
    });
    const newConfig = await store.getGuildConfig(interaction.guildId);
    await interaction.update({
      embeds: [antiLinkEmbed(interaction, newConfig)],
      components: [antiLinkActions()],
      allowedMentions: NO_MENTIONS,
    }).catch((error) => {
      console.error(`Failed to update automod:antilink-admins interaction:`, error.message);
    });
    return true;
  }

  if (action === 'automod:antilink-bots') {
    const antiLinkConfig = config.filterConfigs['anti-link'] || {};
    const newAllowBots = !antiLinkConfig.allowBotLinks;
    await store.setFilterConfig(interaction.guildId, 'anti-link', {
      ...antiLinkConfig,
      allowBotLinks: newAllowBots,
    });
    await logger.logConfigChange(interaction.client, interaction.guildId, config.logChannelId, {
      actorId: interaction.user.id,
      actorName: interaction.user.tag,
      changeType: 'Toggle Bot Bypass',
      details: newAllowBots ? 'Enabled' : 'Disabled',
    });
    const newConfig = await store.getGuildConfig(interaction.guildId);
    await interaction.update({
      embeds: [antiLinkEmbed(interaction, newConfig)],
      components: [antiLinkActions()],
      allowedMentions: NO_MENTIONS,
    }).catch((error) => {
      console.error(`Failed to update automod:antilink-bots interaction:`, error.message);
    });
    return true;
  }

  if (action === 'automod:antilink-add-domain') {
    // For now, just show a notice - modal implementation would be added here
    await interaction.update({
      embeds: [noticeEmbed(interaction, {
        title: 'Add Domain',
        description: 'Domain whitelisting will be implemented via modal input in a future update.\n\nFor now, domains can be added directly via the API.',
        color: COLORS.neutral,
      })],
      components: [antiLinkActions()],
      allowedMentions: NO_MENTIONS,
    }).catch((error) => {
      console.error(`Failed to update automod:antilink-add-domain interaction:`, error.message);
    });
    return true;
  }

  if (action === 'automod:antilink-back') {
    await interaction.update({
      embeds: [dashboardEmbed(interaction, config)],
      components: [dashboardActions(), dashboardActionsRow2()],
      allowedMentions: NO_MENTIONS,
    }).catch((error) => {
      console.error(`Failed to update automod:antilink-back interaction:`, error.message);
    });
    return true;
  }

  // Anti-Spam configuration handlers
  if (action === 'automod:antispam-toggle') {
    const isEnabled = config.enabledFilters.has('spam');
    await store.setFilterEnabled(interaction.guildId, 'spam', !isEnabled);
    await logger.logConfigChange(interaction.client, interaction.guildId, config.logChannelId, {
      actorId: interaction.user.id,
      actorName: interaction.user.tag,
      changeType: 'Toggle Anti-Spam Module',
      details: !isEnabled ? 'Enabled' : 'Disabled',
    });
    const newConfig = await store.getGuildConfig(interaction.guildId);
    await interaction.update({
      embeds: [antiSpamEmbed(interaction, newConfig)],
      components: [antiSpamActions()],
      allowedMentions: NO_MENTIONS,
    }).catch((error) => {
      console.error(`Failed to update automod:antispam-toggle interaction:`, error.message);
    });
    return true;
  }

  if (action === 'automod:antispam-bots') {
    const spamConfig = config.filterConfigs['spam'] || {};
    const newIgnoreBots = spamConfig.ignoreBots !== false; // Default is true
    await store.setFilterConfig(interaction.guildId, 'spam', {
      ...spamConfig,
      ignoreBots: !newIgnoreBots,
    });
    await logger.logConfigChange(interaction.client, interaction.guildId, config.logChannelId, {
      actorId: interaction.user.id,
      actorName: interaction.user.tag,
      changeType: 'Toggle Bot Bypass',
      details: !newIgnoreBots ? 'Enabled' : 'Disabled',
    });
    const newConfig = await store.getGuildConfig(interaction.guildId);
    await interaction.update({
      embeds: [antiSpamEmbed(interaction, newConfig)],
      components: [antiSpamActions()],
      allowedMentions: NO_MENTIONS,
    }).catch((error) => {
      console.error(`Failed to update automod:antispam-bots interaction:`, error.message);
    });
    return true;
  }

  if (action === 'automod:antispam-admins') {
    const spamConfig = config.filterConfigs['spam'] || {};
    const newIgnoreAdmins = spamConfig.ignoreAdmins !== false; // Default is true
    await store.setFilterConfig(interaction.guildId, 'spam', {
      ...spamConfig,
      ignoreAdmins: !newIgnoreAdmins,
    });
    await logger.logConfigChange(interaction.client, interaction.guildId, config.logChannelId, {
      actorId: interaction.user.id,
      actorName: interaction.user.tag,
      changeType: 'Toggle Admin Bypass',
      details: !newIgnoreAdmins ? 'Enabled' : 'Disabled',
    });
    const newConfig = await store.getGuildConfig(interaction.guildId);
    await interaction.update({
      embeds: [antiSpamEmbed(interaction, newConfig)],
      components: [antiSpamActions()],
      allowedMentions: NO_MENTIONS,
    }).catch((error) => {
      console.error(`Failed to update automod:antispam-admins interaction:`, error.message);
    });
    return true;
  }

  if (action === 'automod:antispam-thresholds') {
    // For now, just show a notice - modal implementation would be added here
    await interaction.update({
      embeds: [noticeEmbed(interaction, {
        title: 'Threshold Configuration',
        description: 'Threshold configuration will be implemented via modal input in a future update.\n\nFor now, thresholds can be configured directly via the API.\n\nCurrent thresholds:\n• Message Limit: 5 / 10s\n• Duplicate Limit: 3\n• Character Limit: 10\n• Emoji Limit: 10\n• Line Limit: 10\n• Word Repetition: 5',
        color: COLORS.neutral,
      })],
      components: [antiSpamActions()],
      allowedMentions: NO_MENTIONS,
    }).catch((error) => {
      console.error(`Failed to update automod:antispam-thresholds interaction:`, error.message);
    });
    return true;
  }

  if (action === 'automod:antispam-back') {
    await interaction.update({
      embeds: [dashboardEmbed(interaction, config)],
      components: [dashboardActions(), dashboardActionsRow2()],
      allowedMentions: NO_MENTIONS,
    }).catch((error) => {
      console.error(`Failed to update automod:antispam-back interaction:`, error.message);
    });
    return true;
  }

  return false;
  } catch (error) {
    console.error('handleAutomodInteraction failed:', error);
    console.error('Full stack trace:', error.stack);
    const reply = {
      embeds: [noticeEmbed(interaction, {
        title: 'Interaction Error',
        description: 'Failed to handle button interaction. Please try again.',
        color: COLORS.danger,
      })],
      ephemeral: true,
      allowedMentions: NO_MENTIONS,
    };
    if (interaction.deferred || interaction.replied) await interaction.editReply(reply).catch(() => null);
    else await interaction.reply(reply).catch(() => null);
    return true; // Return true to indicate we handled it (even if with an error)
  }
}

/**
 * Handles AutoMod select menu interactions.
 * @param {Interaction} interaction - Discord interaction
 * @param {AutoModStore} store - AutoMod store instance
 * @returns {Promise<boolean>} True if interaction was handled, false otherwise
 */
async function handleAutomodSelectMenu(interaction, store) {
  try {
    if (!interaction.isStringSelectMenu() || interaction.customId !== 'automod:modules-select') return false;

    // Check if interaction was already replied to (prevents duplicate replies)
    if (interaction.replied || interaction.deferred) return false;

    const config = await store.getGuildConfig(interaction.guildId);
    const selectedFilterId = interaction.values[0];
    const filter = getFilterById(selectedFilterId);

    if (!filter) return false;

    const isEnabled = config.enabledFilters.has(selectedFilterId);
    if (isEnabled) {
      await store.setFilterEnabled(interaction.guildId, selectedFilterId, false);
    } else {
      await store.setFilterEnabled(interaction.guildId, selectedFilterId, true);
    }

    await logger.logConfigChange(interaction.client, interaction.guildId, config.logChannelId, {
      actorId: interaction.user.id,
      actorName: interaction.user.tag,
      changeType: 'Toggle Module',
      details: `${filter.displayName}: ${isEnabled ? 'Disabled' : 'Enabled'}`,
    });

    const newConfig = await store.getGuildConfig(interaction.guildId);
    await interaction.update({
      embeds: [modulesEmbed(interaction, newConfig)],
      components: [modulesActions(), createModulesSelectMenu(newConfig)],
      allowedMentions: NO_MENTIONS,
    }).catch((error) => {
      console.error(`Failed to update automod:modules-select interaction:`, error.message);
    });

    return true;
  } catch (error) {
    console.error('handleAutomodSelectMenu failed:', error);
    console.error('Full stack trace:', error.stack);
    const reply = {
      embeds: [noticeEmbed(interaction, {
        title: 'Select Menu Error',
        description: 'Failed to handle select menu interaction. Please try again.',
        color: COLORS.danger,
      })],
      ephemeral: true,
      allowedMentions: NO_MENTIONS,
    };
    if (interaction.deferred || interaction.replied) await interaction.editReply(reply).catch(() => null);
    else await interaction.reply(reply).catch(() => null);
    return true; // Return true to indicate we handled it (even if with an error)
  }
}

/**
 * Creates the modules select menu.
 * @param {object} config - Guild AutoMod configuration
 * @returns {ActionRowBuilder} Select menu action row
 */
function createModulesSelectMenu(config) {
  const filters = getAvailableFilters();
  const selectMenu = new StringSelectMenuBuilder()
    .setCustomId('automod:modules-select')
    .setPlaceholder('Select a module to toggle')
    .addOptions(
      filters.map((filter) =>
        new StringSelectMenuOptionBuilder()
          .setLabel(filter.displayName)
          .setValue(filter.id)
          .setDescription(config.enabledFilters.has(filter.id) ? 'Click to disable' : 'Click to enable'),
      ),
    );

  return new ActionRowBuilder().addComponents(selectMenu);
}

module.exports = {
  automodCommand,
  handleAutomodCommand,
  handleAutomodInteraction,
  handleAutomodSelectMenu,
};
