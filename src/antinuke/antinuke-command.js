const {
  SlashCommandBuilder,
  PermissionFlagsBits,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} = require('discord.js');
const { COLORS, EMOJIS, brandedEmbed, noticeEmbed, NO_MENTIONS } = require('../brand');

/**
 * Anti-Nuke Command
 * Provides configuration for the Anti-Nuke system
 */

const antinukeCommand = new SlashCommandBuilder()
  .setName('antinuke')
  .setDescription('Configure Anti-Nuke protection against rogue admins.')
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
  .setDMPermission(false)
  .addSubcommand((subcommand) =>
    subcommand
      .setName('enable')
      .setDescription('Enable Anti-Nuke protection for this server')
  )
  .addSubcommand((subcommand) =>
    subcommand
      .setName('disable')
      .setDescription('Disable Anti-Nuke protection for this server')
  )
  .addSubcommand((subcommand) =>
    subcommand
      .setName('quarantine')
      .setDescription('Set the quarantine role for suspicious users')
      .addRoleOption((option) =>
        option.setName('role').setDescription('The role to use for quarantine').setRequired(true)
      )
  )
  .addSubcommand((subcommand) =>
    subcommand
      .setName('panic')
      .setDescription('Toggle panic mode (server lockdown on detection)')
      .addBooleanOption((option) =>
        option.setName('enabled').setDescription('Enable or disable panic mode').setRequired(true)
      )
  )
  .addSubcommand((subcommand) =>
    subcommand
      .setName('threshold')
      .setDescription('Set detection thresholds')
      .addStringOption((option) =>
        option
          .setName('type')
          .setDescription('The threshold type')
          .setRequired(true)
          .addChoices(
            { name: 'Mass Ban', value: 'massBan' },
            { name: 'Mass Kick', value: 'massKick' },
            { name: 'Mass Delete', value: 'massDelete' },
            { name: 'Mass Create', value: 'massCreate' },
            { name: 'Mass Role Delete', value: 'massRoleDelete' },
            { name: 'Mass Role Create', value: 'massRoleCreate' }
          )
      )
      .addIntegerOption((option) =>
        option.setName('value').setDescription('The threshold value').setRequired(true).setMinValue(1)
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
      .setDescription('View current Anti-Nuke configuration')
  );

async function handleAntiNukeCommand(interaction, store) {
  if (!interaction.inGuild()) {
    await interaction.reply({
      embeds: [noticeEmbed(interaction, {
        title: 'Server-only command',
        description: 'Anti-Nuke can only be configured within a server.',
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
            title: `${EMOJIS.check} Anti-Nuke Enabled`,
            description: 'Anti-Nuke protection is now active for this server.',
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
            title: `${EMOJIS.question} Anti-Nuke Disabled`,
            description: 'Anti-Nuke protection has been disabled for this server.',
            color: COLORS.neutral,
          })],
          ephemeral: true,
          allowedMentions: NO_MENTIONS,
        });
        break;

      case 'quarantine':
        const role = interaction.options.getRole('role');
        await store.setQuarantineRole(guildId, role.id);
        await interaction.reply({
          embeds: [brandedEmbed(interaction, {
            title: `${EMOJIS.people} Quarantine Role Set`,
            description: `Quarantine role set to ${role}. Suspicious users will be assigned this role.`,
            color: COLORS.success,
          })],
          ephemeral: true,
          allowedMentions: NO_MENTIONS,
        });
        break;

      case 'panic':
        const enabled = interaction.options.getBoolean('enabled');
        await store.setPanicMode(guildId, enabled);
        await interaction.reply({
          embeds: [brandedEmbed(interaction, {
            title: `${EMOJIS.warning} Panic Mode ${enabled ? 'Enabled' : 'Disabled'}`,
            description: enabled
              ? 'Panic mode will lock down the server when suspicious activity is detected.'
              : 'Panic mode will not lock down the server on detection.',
            color: enabled ? COLORS.danger : COLORS.neutral,
          })],
          ephemeral: true,
          allowedMentions: NO_MENTIONS,
        });
        break;

      case 'threshold':
        const type = interaction.options.getString('type');
        const value = interaction.options.getInteger('value');
        await store.setThreshold(guildId, type, value);
        await interaction.reply({
          embeds: [brandedEmbed(interaction, {
            title: `${EMOJIS.ticket} Threshold Updated`,
            description: `${type} threshold set to ${value} actions in 10 seconds.`,
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
              description: `<@${id}> is now exempt from Anti-Nuke detection.`,
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
              description: `<@${id}> is no longer exempt from Anti-Nuke detection.`,
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
              description: `<@&${id}> members are now exempt from Anti-Nuke detection.`,
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
              description: `<@&${id}> members are no longer exempt from Anti-Nuke detection.`,
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
          title: `${EMOJIS.database} Anti-Nuke Status`,
          description: 'Current Anti-Nuke configuration for this server.',
          color: COLORS.brand,
          fields: [
            {
              name: `${EMOJIS.check} STATUS`,
              value: config.enabled ? `${EMOJIS.online} Enabled` : `${EMOJIS.question} Disabled`,
              inline: true,
            },
            {
              name: `${EMOJIS.people} QUARANTINE ROLE`,
              value: config.quarantineRoleId ? `<@&${config.quarantineRoleId}>` : '`Not set`',
              inline: true,
            },
            {
              name: `${EMOJIS.warning} PANIC MODE`,
              value: config.panicMode ? `${EMOJIS.online} Enabled` : `${EMOJIS.question} Disabled`,
              inline: true,
            },
            {
              name: `${EMOJIS.ticket} THRESHOLDS`,
              value: `Mass Ban: ${config.thresholds.massBan}\nMass Kick: ${config.thresholds.massKick}\nMass Delete: ${config.thresholds.massDelete}\nMass Create: ${config.thresholds.massCreate}\nMass Role Delete: ${config.thresholds.massRoleDelete}\nMass Role Create: ${config.thresholds.massRoleCreate}`,
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
    console.error('Anti-Nuke command failed:', error);
    await interaction.reply({
      embeds: [noticeEmbed(interaction, {
        title: 'Command Error',
        description: 'Failed to execute Anti-Nuke command. Please try again.',
        color: COLORS.danger,
      })],
      ephemeral: true,
      allowedMentions: NO_MENTIONS,
    });
  }
}

module.exports = {
  antinukeCommand,
  handleAntiNukeCommand,
};
