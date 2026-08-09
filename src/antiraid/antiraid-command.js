const {
  SlashCommandBuilder,
  PermissionFlagsBits,
} = require('discord.js');
const { COLORS, EMOJIS, brandedEmbed, noticeEmbed, NO_MENTIONS } = require('../brand');

/**
 * Anti-Raid Command
 * Provides configuration for the Anti-Raid system
 */

const antiraidCommand = new SlashCommandBuilder()
  .setName('antiraid')
  .setDescription('Configure Anti-Raid protection against bot raids.')
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
  .setDMPermission(false)
  .addSubcommand((subcommand) =>
    subcommand
      .setName('enable')
      .setDescription('Enable Anti-Raid protection for this server')
  )
  .addSubcommand((subcommand) =>
    subcommand
      .setName('disable')
      .setDescription('Disable Anti-Raid protection for this server')
  )
  .addSubcommand((subcommand) =>
    subcommand
      .setName('joingate')
      .setDescription('Configure join gate settings')
      .addBooleanOption((option) =>
        option.setName('enabled').setDescription('Enable or disable join gate').setRequired(true)
      )
      .addIntegerOption((option) =>
        option.setName('min_age').setDescription('Minimum account age in hours (0 = disabled)').setMinValue(0)
      )
      .addBooleanOption((option) =>
        option.setName('require_avatar').setDescription('Require users to have an avatar')
      )
      .addBooleanOption((option) =>
        option.setName('suspicious').setDescription('Enable suspicious account detection')
      )
      .addBooleanOption((option) =>
        option.setName('block_invites').setDescription('Block users with invites in username')
      )
      .addBooleanOption((option) =>
        option.setName('block_unverified_bots').setDescription('Block unverified bots')
      )
  )
  .addSubcommand((subcommand) =>
    subcommand
      .setName('raiddetection')
      .setDescription('Configure raid detection')
      .addBooleanOption((option) =>
        option.setName('enabled').setDescription('Enable or disable raid detection').setRequired(true)
      )
      .addIntegerOption((option) =>
        option.setName('max_joins').setDescription('Max joins per minute to trigger lockdown').setMinValue(1)
      )
      .addIntegerOption((option) =>
        option.setName('lockdown_duration').setDescription('Lockdown duration in minutes').setMinValue(1)
      )
  )
  .addSubcommand((subcommand) =>
    subcommand
      .setName('whitelist')
      .setDescription('Manage whitelist')
      .addStringOption((option) =>
        option
          .setName('action')
          .setDescription('Add or remove from whitelist')
          .setRequired(true)
          .addChoices(
            { name: 'Add User', value: 'addUser' },
            { name: 'Remove User', value: 'removeUser' },
            { name: 'Add Role', value: 'addRole' },
            { name: 'Remove Role', value: 'removeRole' }
          )
      )
      .addStringOption((option) =>
        option.setName('id').setDescription('User or Role ID').setRequired(true)
      )
  )
  .addSubcommand((subcommand) =>
    subcommand
      .setName('status')
      .setDescription('View current Anti-Raid configuration')
  );

async function handleAntiRaidCommand(interaction, store) {
  if (!interaction.inGuild()) {
    await interaction.reply({
      embeds: [noticeEmbed(interaction, {
        title: 'Server-only command',
        description: 'Anti-Raid can only be configured within a server.',
        color: COLORS.neutral,
      })],
      ephemeral: true,
      allowedMentions: NO_MENTIONS,
    });
    return;
  }

  const subcommand = interaction.options.getSubcommand();
  const guildId = interaction.guildId;

  try {
    switch (subcommand) {
      case 'enable':
        await store.setEnabled(guildId, true);
        await interaction.reply({
          embeds: [brandedEmbed(interaction, {
            title: `${EMOJIS.check} Anti-Raid Enabled`,
            description: 'Anti-Raid protection is now active for this server.',
            color: COLORS.success,
          })],
          ephemeral: true,
          allowedMentions: NO_MENTIONS,
        });
        break;

      case 'disable':
        await store.setEnabled(guildId, false);
        await interaction.reply({
          embeds: [brandedEmbed(interaction, {
            title: `${EMOJIS.question} Anti-Raid Disabled`,
            description: 'Anti-Raid protection has been disabled for this server.',
            color: COLORS.neutral,
          })],
          ephemeral: true,
          allowedMentions: NO_MENTIONS,
        });
        break;

      case 'joingate':
        const enabled = interaction.options.getBoolean('enabled');
        await store.setJoinGateEnabled(guildId, enabled);

        const minAge = interaction.options.getInteger('min_age');
        if (minAge !== null) {
          await store.setMinAccountAge(guildId, minAge);
        }

        const requireAvatar = interaction.options.getBoolean('require_avatar');
        if (requireAvatar !== null) {
          await store.setRequireAvatar(guildId, requireAvatar);
        }

        const suspicious = interaction.options.getBoolean('suspicious');
        if (suspicious !== null) {
          await store.setSuspiciousDetection(guildId, suspicious);
        }

        const blockInvites = interaction.options.getBoolean('block_invites');
        if (blockInvites !== null) {
          await store.setBlockInviteInUsername(guildId, blockInvites);
        }

        const blockUnverifiedBots = interaction.options.getBoolean('block_unverified_bots');
        if (blockUnverifiedBots !== null) {
          await store.setBlockUnverifiedBots(guildId, blockUnverifiedBots);
        }

        await interaction.reply({
          embeds: [brandedEmbed(interaction, {
            title: `${EMOJIS.people} Join Gate Updated`,
            description: `Join gate ${enabled ? 'enabled' : 'disabled'}.`,
            color: COLORS.success,
          })],
          ephemeral: true,
          allowedMentions: NO_MENTIONS,
        });
        break;

      case 'raiddetection':
        const raidEnabled = interaction.options.getBoolean('enabled');
        await store.setRaidDetectionEnabled(guildId, raidEnabled);

        const maxJoins = interaction.options.getInteger('max_joins');
        if (maxJoins !== null) {
          await store.setMaxJoinsPerMinute(guildId, maxJoins);
        }

        const lockdownDuration = interaction.options.getInteger('lockdown_duration');
        if (lockdownDuration !== null) {
          await store.setLockdownDuration(guildId, lockdownDuration);
        }

        await interaction.reply({
          embeds: [brandedEmbed(interaction, {
            title: `${EMOJIS.warning} Raid Detection Updated`,
            description: `Raid detection ${raidEnabled ? 'enabled' : 'disabled'}.`,
            color: COLORS.success,
          })],
          ephemeral: true,
          allowedMentions: NO_MENTIONS,
        });
        break;

      case 'whitelist':
        const action = interaction.options.getString('action');
        const id = interaction.options.getString('id');

        if (action === 'addUser') {
          await store.addWhitelistedUser(guildId, id);
          await interaction.reply({
            embeds: [brandedEmbed(interaction, {
              title: `${EMOJIS.people} User Whitelisted`,
              description: `<@${id}> is now exempt from Anti-Raid detection.`,
              color: COLORS.success,
            })],
            ephemeral: true,
            allowedMentions: NO_MENTIONS,
          });
        } else if (action === 'removeUser') {
          await store.removeWhitelistedUser(guildId, id);
          await interaction.reply({
            embeds: [brandedEmbed(interaction, {
              title: `${EMOJIS.people} User Removed from Whitelist`,
              description: `<@${id}> is no longer exempt from Anti-Raid detection.`,
              color: COLORS.neutral,
            })],
            ephemeral: true,
            allowedMentions: NO_MENTIONS,
          });
        } else if (action === 'addRole') {
          await store.addWhitelistedRole(guildId, id);
          await interaction.reply({
            embeds: [brandedEmbed(interaction, {
              title: `${EMOJIS.people} Role Whitelisted`,
              description: `<@&${id}> members are now exempt from Anti-Raid detection.`,
              color: COLORS.success,
            })],
            ephemeral: true,
            allowedMentions: NO_MENTIONS,
          });
        } else if (action === 'removeRole') {
          await store.removeWhitelistedRole(guildId, id);
          await interaction.reply({
            embeds: [brandedEmbed(interaction, {
              title: `${EMOJIS.people} Role Removed from Whitelist`,
              description: `<@&${id}> members are no longer exempt from Anti-Raid detection.`,
              color: COLORS.neutral,
            })],
            ephemeral: true,
            allowedMentions: NO_MENTIONS,
          });
        }
        break;

      case 'status':
        const config = await store.getGuildConfig(guildId);
        const embed = brandedEmbed(interaction, {
          title: `${EMOJIS.database} Anti-Raid Status`,
          description: 'Current Anti-Raid configuration for this server.',
          color: COLORS.brand,
          fields: [
            {
              name: `${EMOJIS.check} STATUS`,
              value: config.enabled ? `${EMOJIS.online} Enabled` : `${EMOJIS.question} Disabled`,
              inline: true,
            },
            {
              name: `${EMOJIS.people} JOIN GATE`,
              value: config.joinGate.enabled ? `${EMOJIS.online} Enabled` : `${EMOJIS.question} Disabled`,
              inline: true,
            },
            {
              name: `${EMOJIS.warning} RAID DETECTION`,
              value: config.raidDetection.enabled ? `${EMOJIS.online} Enabled` : `${EMOJIS.question} Disabled`,
              inline: true,
            },
            {
              name: `${EMOJIS.ticket} JOIN GATE SETTINGS`,
              value: `Min Account Age: ${config.joinGate.minAccountAge > 0 ? `${config.joinGate.minAccountAge / 3600000}h` : 'Disabled'}\nRequire Avatar: ${config.joinGate.requireAvatar ? 'Yes' : 'No'}\nSuspicious Detection: ${config.joinGate.suspiciousDetection ? 'Yes' : 'No'}\nBlock Invites: ${config.joinGate.blockInviteInUsername ? 'Yes' : 'No'}\nBlock Unverified Bots: ${config.joinGate.blockUnverifiedBots ? 'Yes' : 'No'}`,
              inline: false,
            },
            {
              name: `${EMOJIS.warning} RAID DETECTION SETTINGS`,
              value: `Max Joins/Min: ${config.raidDetection.maxJoinsPerMinute}\nLockdown Duration: ${config.raidDetection.lockdownDuration / 60000}min`,
              inline: false,
            },
            {
              name: `${EMOJIS.people} WHITELISTED USERS`,
              value: config.whitelist.users.length > 0
                ? config.whitelist.users.map((id) => `<@${id}>`).join(', ')
                : '`None`',
              inline: false,
            },
            {
              name: `${EMOJIS.people} WHITELISTED ROLES`,
              value: config.whitelist.roles.length > 0
                ? config.whitelist.roles.map((id) => `<@&${id}>`).join(', ')
                : '`None`',
              inline: false,
            },
          ],
        });
        await interaction.reply({
          embeds: [embed],
          ephemeral: true,
          allowedMentions: NO_MENTIONS,
        });
        break;
    }
  } catch (error) {
    console.error('Anti-Raid command failed:', error);
    await interaction.reply({
      embeds: [noticeEmbed(interaction, {
        title: 'Command Error',
        description: 'Failed to execute Anti-Raid command. Please try again.',
        color: COLORS.danger,
      })],
      ephemeral: true,
      allowedMentions: NO_MENTIONS,
    });
  }
}

module.exports = {
  antiraidCommand,
  handleAntiRaidCommand,
};
