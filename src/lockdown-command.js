const { PermissionFlagsBits, SlashCommandBuilder, ChannelType } = require('discord.js');
const {
  COLORS,
  EMOJIS,
  NO_MENTIONS,
  brandedEmbed,
  noticeEmbed,
} = require('./brand');
const { auditLog } = require('./audit');

const EXECUTIVE_ROLE_ID = process.env.EXECUTIVE_ROLE_ID || '1494510299976568842';
const EXECUTIVE_AUTH_KEY = process.env.EXECUTIVE_AUTH_KEY;

const lockdownCommand = new SlashCommandBuilder()
  .setName('lockdown')
  .setDescription('Server lockdown commands for executives only.')
  .addSubcommand((subcommand) => subcommand
    .setName('initiate')
    .setDescription('Initiate a full server lockdown.')
    .addStringOption((option) => option
      .setName('auth_key')
      .setDescription('Executive authentication key')
      .setRequired(true))
    .addStringOption((option) => option
      .setName('reason')
      .setDescription('Reason for the lockdown')
      .setMaxLength(500)
      .setRequired(true)))
  .addSubcommand((subcommand) => subcommand
    .setName('lift')
    .setDescription('Lift the server lockdown with authentication key.')
    .addStringOption((option) => option
      .setName('auth_key')
      .setDescription('Authentication key to lift lockdown')
      .setRequired(true)))
  .addSubcommand((subcommand) => subcommand
    .setName('status')
    .setDescription('Check the current lockdown status.'))
  .setDMPermission(false);

function quote(value) {
  return `> ${value.replace(/\n/g, '\n> ')}`;
}

async function hasExecutiveAccess(interaction) {
  if (!interaction.inGuild()) return false;
  
  if (interaction.memberPermissions?.has(PermissionFlagsBits.Administrator)) return true;
  
  if (interaction.member.roles.cache.has(EXECUTIVE_ROLE_ID)) return true;
  
  return false;
}

async function requireExecutiveAccess(interaction) {
  if (await hasExecutiveAccess(interaction)) return true;
  
  await interaction.reply({
    embeds: [noticeEmbed(interaction, {
      title: 'Executive access required',
      description: 'You need the **Executive** role or Administrator permission to use lockdown commands.',
      color: COLORS.danger,
    })],
    ephemeral: true,
    allowedMentions: NO_MENTIONS,
  });
  return false;
}

function verifyAuthKey(inputKey) {
  if (!EXECUTIVE_AUTH_KEY) {
    console.error('EXECUTIVE_AUTH_KEY is not configured in environment variables.');
    return false;
  }
  return inputKey === EXECUTIVE_AUTH_KEY;
}

function successEmbed(interaction, { title, description, fields = [] }) {
  return brandedEmbed(interaction, {
    title: `${EMOJIS.check} ${title}`,
    description,
    color: COLORS.success,
    fields,
  });
}

function errorEmbed(interaction, description) {
  return noticeEmbed(interaction, {
    title: 'Action unavailable',
    description,
    color: COLORS.danger,
  });
}

async function replyWithEmbed(interaction, embed) {
  await interaction.reply({ embeds: [embed], ephemeral: true, allowedMentions: NO_MENTIONS });
}

async function editWithEmbed(interaction, embed) {
  await interaction.editReply({ embeds: [embed], allowedMentions: NO_MENTIONS });
}

async function lockAllChannels(guild) {
  const channels = guild.channels.cache.filter(c => 
    c.isTextBased() && 
    c.permissionsFor(guild.roles.everyone).has(PermissionFlagsBits.SendMessages)
  );
  
  const lockedChannels = [];
  for (const channel of channels.values()) {
    try {
      await channel.permissionOverwrites.edit(guild.roles.everyone, {
        SendMessages: false,
      }, 'Server lockdown initiated');
      lockedChannels.push(channel.id);
    } catch (error) {
      console.error(`Failed to lock channel ${channel.id}:`, error.message);
    }
  }
  
  return lockedChannels;
}

async function unlockAllChannels(guild, lockedChannelIds) {
  for (const channelId of lockedChannelIds) {
    try {
      const channel = await guild.channels.fetch(channelId).catch(() => null);
      if (channel && channel.isTextBased()) {
        await channel.permissionOverwrites.edit(guild.roles.everyone, {
          SendMessages: null,
        }, 'Server lockdown lifted');
      }
    } catch (error) {
      console.error(`Failed to unlock channel ${channelId}:`, error.message);
    }
  }
}

async function handleLockdownCommand(interaction, store) {
  if (!interaction.inGuild()) {
    await replyWithEmbed(interaction, noticeEmbed(interaction, {
      title: 'Server-only command',
      description: 'Lockdown commands can only be used within a server.',
      color: COLORS.warning,
    }));
    return;
  }

  if (!await requireExecutiveAccess(interaction)) return;

  const subcommand = interaction.options.getSubcommand();

  if (subcommand === 'initiate') {
    const authKey = interaction.options.getString('auth_key', true);
    const reason = interaction.options.getString('reason', true);

    await interaction.deferReply({ ephemeral: true });

    if (!EXECUTIVE_AUTH_KEY) {
      await editWithEmbed(interaction, errorEmbed(interaction, 'EXECUTIVE_AUTH_KEY is not configured. Please contact the bot administrator.'));
      return;
    }

    if (!verifyAuthKey(authKey)) {
      await auditLog(interaction.client, interaction.guildId, {
        action: 'LOCKDOWN_FAILED_ATTEMPT',
        actorId: interaction.user.id,
        target: 'Server',
        detail: `<@${interaction.user.id}> failed to initiate server lockdown (invalid authentication key).`,
        color: COLORS.danger,
      });

      await editWithEmbed(interaction, errorEmbed(interaction, 'Invalid authentication key. Access denied.'));
      return;
    }

    if (store.isLocked(interaction.guildId)) {
      await editWithEmbed(interaction, noticeEmbed(interaction, {
        title: 'Server already locked down',
        description: 'This server is already in lockdown mode. Use /lockdown lift with the executive authentication key to unlock.',
        color: COLORS.warning,
      }));
      return;
    }

    const lockedChannels = await lockAllChannels(interaction.guild);

    await store.setLockdown(interaction.guildId, {
      lockedBy: interaction.user.id,
      reason,
      channelsLocked: lockedChannels,
    });

    await auditLog(interaction.client, interaction.guildId, {
      action: 'LOCKDOWN_INITIATE',
      actorId: interaction.user.id,
      target: 'Server',
      detail: `<@${interaction.user.id}> initiated a full server lockdown.`,
      color: COLORS.danger,
      fields: [
        { name: `${EMOJIS.ticket} REASON`, value: quote(reason) },
        { name: `${EMOJIS.ticket} CHANNELS LOCKED`, value: `${lockedChannels.length}`, inline: true },
      ],
    });

    await editWithEmbed(interaction, brandedEmbed(interaction, {
      title: `${EMOJIS.warning} SERVER LOCKDOWN INITIATED`,
      description: 'The server has been locked down. All channels have been restricted.',
      color: COLORS.danger,
      fields: [
        { name: `${EMOJIS.ticket} REASON`, value: quote(reason) },
        { name: `${EMOJIS.ticket} CHANNELS LOCKED`, value: `${lockedChannels.length}`, inline: true },
        {
          name: `${EMOJIS.question} TO UNLOCK`,
          value: 'Use /lockdown lift with the executive authentication key.',
        },
      ],
    }));
    return;
  }

  if (subcommand === 'lift') {
    const authKey = interaction.options.getString('auth_key', true);

    await interaction.deferReply({ ephemeral: true });

    if (!store.isLocked(interaction.guildId)) {
      await editWithEmbed(interaction, noticeEmbed(interaction, {
        title: 'Server not locked down',
        description: 'This server is not currently in lockdown mode.',
        color: COLORS.neutral,
      }));
      return;
    }

    if (!verifyAuthKey(authKey)) {
      await auditLog(interaction.client, interaction.guildId, {
        action: 'LOCKDOWN_FAILED_ATTEMPT',
        actorId: interaction.user.id,
        target: 'Server',
        detail: `<@${interaction.user.id}> failed to lift the server lockdown (invalid authentication key).`,
        color: COLORS.danger,
      });

      await editWithEmbed(interaction, errorEmbed(interaction, 'Invalid authentication key. The lockdown remains active.'));
      return;
    }

    const lockdown = store.getLockdown(interaction.guildId);
    await unlockAllChannels(interaction.guild, lockdown.channelsLocked);
    await store.removeLockdown(interaction.guildId);

    await auditLog(interaction.client, interaction.guildId, {
      action: 'LOCKDOWN_LIFT',
      actorId: interaction.user.id,
      target: 'Server',
      detail: `<@${interaction.user.id}> lifted the server lockdown.`,
      color: COLORS.success,
      fields: [
        { name: `${EMOJIS.ticket} LOCKED BY`, value: `<@${lockdown.lockedBy}>`, inline: true },
        { name: `${EMOJIS.ticket} LOCKED AT`, value: lockdown.lockedAt, inline: true },
      ],
    });

    await editWithEmbed(interaction, successEmbed(interaction, {
      title: 'Server lockdown lifted',
      description: 'The server lockdown has been lifted. All channels have been restored.',
      fields: [
        { name: `${EMOJIS.ticket} LOCKED BY`, value: `<@${lockdown.lockedBy}>`, inline: true },
        { name: `${EMOJIS.ticket} LOCKED AT`, value: lockdown.lockedAt, inline: true },
      ],
    }));
    return;
  }

  if (subcommand === 'status') {
    await interaction.deferReply({ ephemeral: true });

    const lockdown = store.getLockdown(interaction.guildId);

    if (!lockdown) {
      await editWithEmbed(interaction, brandedEmbed(interaction, {
        title: `${EMOJIS.check} Server Status: Normal`,
        description: 'The server is not currently locked down.',
        color: COLORS.success,
      }));
      return;
    }

    const lockedAt = Math.floor(Date.parse(lockdown.lockedAt) / 1000);
    await editWithEmbed(interaction, brandedEmbed(interaction, {
      title: `${EMOJIS.warning} Server Status: LOCKDOWN`,
      description: 'The server is currently in lockdown mode.',
      color: COLORS.danger,
      fields: [
        { name: `${EMOJIS.people} LOCKED BY`, value: `<@${lockdown.lockedBy}>`, inline: true },
        { name: `${EMOJIS.online} LOCKED AT`, value: `<t:${lockedAt}:F>\n<t:${lockedAt}:R>`, inline: true },
        { name: `${EMOJIS.ticket} REASON`, value: quote(lockdown.reason) },
        { name: `${EMOJIS.ticket} CHANNELS LOCKED`, value: `${lockdown.channelsLocked.length}`, inline: true },
      ],
    }));
    return;
  }
}

module.exports = { lockdownCommand, handleLockdownCommand, errorEmbed };
