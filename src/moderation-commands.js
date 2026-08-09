const { PermissionFlagsBits, SlashCommandBuilder } = require('discord.js');
const {
  COLORS,
  EMOJIS,
  NO_MENTIONS,
  brandedEmbed,
  noticeEmbed,
} = require('./brand');
const { auditLog } = require('./audit');

const MANAGEMENT_ROLE_ID = process.env.MANAGEMENT_ROLE_ID || '1494515574338879558';

const moderationCommand = new SlashCommandBuilder()
  .setName('mod')
  .setDescription('Common moderation commands for management team.')
  .addSubcommand((subcommand) => subcommand
    .setName('ban')
    .setDescription('Ban a member from the server.')
    .addUserOption((option) => option
      .setName('user')
      .setDescription('Member to ban')
      .setRequired(true))
    .addStringOption((option) => option
      .setName('reason')
      .setDescription('Reason for the ban')
      .setMaxLength(500)
      .setRequired(false)))
  .addSubcommand((subcommand) => subcommand
    .setName('kick')
    .setDescription('Kick a member from the server.')
    .addUserOption((option) => option
      .setName('user')
      .setDescription('Member to kick')
      .setRequired(true))
    .addStringOption((option) => option
      .setName('reason')
      .setDescription('Reason for the kick')
      .setMaxLength(500)
      .setRequired(false)))
  .addSubcommand((subcommand) => subcommand
    .setName('timeout')
    .setDescription('Timeout a member for a specified duration.')
    .addUserOption((option) => option
      .setName('user')
      .setDescription('Member to timeout')
      .setRequired(true))
    .addIntegerOption((option) => option
      .setName('duration')
      .setDescription('Duration in minutes')
      .setMinValue(1)
      .setMaxValue(40320) // 28 days max
      .setRequired(true))
    .addStringOption((option) => option
      .setName('reason')
      .setDescription('Reason for the timeout')
      .setMaxLength(500)
      .setRequired(false)))
  .addSubcommand((subcommand) => subcommand
    .setName('untimeout')
    .setDescription('Remove timeout from a member.')
    .addUserOption((option) => option
      .setName('user')
      .setDescription('Member to untimeout')
      .setRequired(true))
    .addStringOption((option) => option
      .setName('reason')
      .setDescription('Reason for removing timeout')
      .setMaxLength(500)
      .setRequired(false)))
  .addSubcommand((subcommand) => subcommand
    .setName('warn')
    .setDescription('Issue a warning to a member.')
    .addUserOption((option) => option
      .setName('user')
      .setDescription('Member to warn')
      .setRequired(true))
    .addStringOption((option) => option
      .setName('reason')
      .setDescription('Reason for the warning')
      .setMaxLength(500)
      .setRequired(true)))
  .addSubcommand((subcommand) => subcommand
    .setName('purge')
    .setDescription('Delete a specified number of messages from the channel.')
    .addIntegerOption((option) => option
      .setName('amount')
      .setDescription('Number of messages to delete (1-100)')
      .setMinValue(1)
      .setMaxValue(100)
      .setRequired(true))
    .addUserOption((option) => option
      .setName('user')
      .setDescription('Only delete messages from this user')
      .setRequired(false)))
  .setDMPermission(false);

function quote(value) {
  return `> ${value.replace(/\n/g, '\n> ')}`;
}

function userTarget(user) {
  return `<@${user.id}>\n\`${user.username}\`\n\`${user.id}\``;
}

async function hasManagementAccess(interaction) {
  if (!interaction.inGuild()) return false;
  
  // Administrators always have access
  if (interaction.memberPermissions?.has(PermissionFlagsBits.Administrator)) {
    console.log('[Mod Command] Access granted: Administrator permission');
    return true;
  }
  
  // Check for management team role
  console.log(`[Mod Command] Checking for management role: ${MANAGEMENT_ROLE_ID}`);
  console.log(`[Mod Command] User roles: ${Array.from(interaction.member.roles.cache.keys()).join(', ')}`);
  
  if (interaction.member.roles.cache.has(MANAGEMENT_ROLE_ID)) {
    console.log('[Mod Command] Access granted: Management Team role');
    return true;
  }
  
  console.log('[Mod Command] Access denied: No valid permissions');
  return false;
}

async function requireManagementAccess(interaction) {
  if (await hasManagementAccess(interaction)) return true;
  
  await interaction.reply({
    embeds: [noticeEmbed(interaction, {
      title: 'Management access required',
      description: 'You need the **Management Team** role or Administrator permission to use moderation commands.',
      color: COLORS.warning,
    })],
    ephemeral: true,
    allowedMentions: NO_MENTIONS,
  });
  return false;
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

async function handleModerationCommand(interaction) {
  if (!interaction.inGuild()) {
    await replyWithEmbed(interaction, noticeEmbed(interaction, {
      title: 'Server-only command',
      description: 'Moderation commands can only be used within a server.',
      color: COLORS.warning,
    }));
    return;
  }

  if (!await requireManagementAccess(interaction)) return;

  const subcommand = interaction.options.getSubcommand();

  if (subcommand === 'ban') {
    const user = interaction.options.getUser('user', true);
    const reason = interaction.options.getString('reason') ?? 'No reason provided';
    
    if (user.id === interaction.client.user.id) {
      await replyWithEmbed(interaction, errorEmbed(interaction, 'I cannot ban myself.'));
      return;
    }
    
    if (user.id === interaction.user.id) {
      await replyWithEmbed(interaction, errorEmbed(interaction, 'You cannot ban yourself.'));
      return;
    }

    await interaction.deferReply({ ephemeral: true });

    const member = await interaction.guild.members.fetch(user.id).catch(() => null);
    if (!member) {
      await editWithEmbed(interaction, errorEmbed(interaction, 'This member is not in the server.'));
      return;
    }

    if (!member.bannable) {
      await editWithEmbed(interaction, errorEmbed(interaction, 'I cannot ban this member. Check my role position and permissions.'));
      return;
    }

    await member.ban({ reason: `Banned by ${interaction.user.tag}: ${reason}` });
    
    await auditLog(interaction.client, interaction.guildId, {
      action: 'MOD_BAN',
      actorId: interaction.user.id,
      target: userTarget(user),
      detail: `<@${user.id}> has been banned from \`${interaction.guild.name}\`.`,
      color: COLORS.danger,
      fields: [{ name: `${EMOJIS.ticket} REASON`, value: quote(reason) }],
    });

    await editWithEmbed(interaction, successEmbed(interaction, {
      title: 'Member banned',
      description: `<@${user.id}> has been banned from the server.`,
      fields: [
        { name: `${EMOJIS.people} TARGET`, value: userTarget(user), inline: true },
        { name: `${EMOJIS.ticket} REASON`, value: quote(reason), inline: true },
      ],
    }));
    return;
  }

  if (subcommand === 'kick') {
    const user = interaction.options.getUser('user', true);
    const reason = interaction.options.getString('reason') ?? 'No reason provided';
    
    if (user.id === interaction.client.user.id) {
      await replyWithEmbed(interaction, errorEmbed(interaction, 'I cannot kick myself.'));
      return;
    }
    
    if (user.id === interaction.user.id) {
      await replyWithEmbed(interaction, errorEmbed(interaction, 'You cannot kick yourself.'));
      return;
    }

    await interaction.deferReply({ ephemeral: true });

    const member = await interaction.guild.members.fetch(user.id).catch(() => null);
    if (!member) {
      await editWithEmbed(interaction, errorEmbed(interaction, 'This member is not in the server.'));
      return;
    }

    if (!member.kickable) {
      await editWithEmbed(interaction, errorEmbed(interaction, 'I cannot kick this member. Check my role position and permissions.'));
      return;
    }

    await member.kick(`Kicked by ${interaction.user.tag}: ${reason}`);
    
    await auditLog(interaction.client, interaction.guildId, {
      action: 'MOD_KICK',
      actorId: interaction.user.id,
      target: userTarget(user),
      detail: `<@${user.id}> has been kicked from \`${interaction.guild.name}\`.`,
      color: COLORS.warning,
      fields: [{ name: `${EMOJIS.ticket} REASON`, value: quote(reason) }],
    });

    await editWithEmbed(interaction, successEmbed(interaction, {
      title: 'Member kicked',
      description: `<@${user.id}> has been kicked from the server.`,
      fields: [
        { name: `${EMOJIS.people} TARGET`, value: userTarget(user), inline: true },
        { name: `${EMOJIS.ticket} REASON`, value: quote(reason), inline: true },
      ],
    }));
    return;
  }

  if (subcommand === 'timeout') {
    const user = interaction.options.getUser('user', true);
    const duration = interaction.options.getInteger('duration', true);
    const reason = interaction.options.getString('reason') ?? 'No reason provided';
    
    if (user.id === interaction.client.user.id) {
      await replyWithEmbed(interaction, errorEmbed(interaction, 'I cannot timeout myself.'));
      return;
    }
    
    if (user.id === interaction.user.id) {
      await replyWithEmbed(interaction, errorEmbed(interaction, 'You cannot timeout yourself.'));
      return;
    }

    await interaction.deferReply({ ephemeral: true });

    const member = await interaction.guild.members.fetch(user.id).catch(() => null);
    if (!member) {
      await editWithEmbed(interaction, errorEmbed(interaction, 'This member is not in the server.'));
      return;
    }

    if (!member.moderatable) {
      await editWithEmbed(interaction, errorEmbed(interaction, 'I cannot timeout this member. Check my role position and permissions.'));
      return;
    }

    const durationMs = duration * 60 * 1000; // Convert minutes to milliseconds
    await member.timeout(durationMs, `Timed out by ${interaction.user.tag}: ${reason}`);
    
    await auditLog(interaction.client, interaction.guildId, {
      action: 'MOD_TIMEOUT',
      actorId: interaction.user.id,
      target: userTarget(user),
      detail: `<@${user.id}> has been timed out for ${duration} minutes in \`${interaction.guild.name}\`.`,
      color: COLORS.warning,
      fields: [
        { name: `${EMOJIS.ticket} DURATION`, value: `${duration} minutes`, inline: true },
        { name: `${EMOJIS.ticket} REASON`, value: quote(reason), inline: true },
      ],
    });

    await editWithEmbed(interaction, successEmbed(interaction, {
      title: 'Member timed out',
      description: `<@${user.id}> has been timed out for ${duration} minutes.`,
      fields: [
        { name: `${EMOJIS.people} TARGET`, value: userTarget(user), inline: true },
        { name: `${EMOJIS.ticket} DURATION`, value: `${duration} minutes`, inline: true },
        { name: `${EMOJIS.ticket} REASON`, value: quote(reason), inline: true },
      ],
    }));
    return;
  }

  if (subcommand === 'untimeout') {
    const user = interaction.options.getUser('user', true);
    const reason = interaction.options.getString('reason') ?? 'No reason provided';

    await interaction.deferReply({ ephemeral: true });

    const member = await interaction.guild.members.fetch(user.id).catch(() => null);
    if (!member) {
      await editWithEmbed(interaction, errorEmbed(interaction, 'This member is not in the server.'));
      return;
    }

    if (!member.moderatable) {
      await editWithEmbed(interaction, errorEmbed(interaction, 'I cannot remove timeout from this member. Check my role position and permissions.'));
      return;
    }

    if (!member.isCommunicationDisabled()) {
      await editWithEmbed(interaction, noticeEmbed(interaction, {
        title: 'Not timed out',
        description: `<@${user.id}> is not currently timed out.`,
        color: COLORS.neutral,
      }));
      return;
    }

    await member.timeout(null, `Timeout removed by ${interaction.user.tag}: ${reason}`);
    
    await auditLog(interaction.client, interaction.guildId, {
      action: 'MOD_UNTIMEOUT',
      actorId: interaction.user.id,
      target: userTarget(user),
      detail: `<@${user.id}> has had their timeout removed in \`${interaction.guild.name}\`.`,
      color: COLORS.success,
      fields: [{ name: `${EMOJIS.ticket} REASON`, value: quote(reason) }],
    });

    await editWithEmbed(interaction, successEmbed(interaction, {
      title: 'Timeout removed',
      description: `<@${user.id}> can now communicate again.`,
      fields: [
        { name: `${EMOJIS.people} TARGET`, value: userTarget(user), inline: true },
        { name: `${EMOJIS.ticket} REASON`, value: quote(reason), inline: true },
      ],
    }));
    return;
  }

  if (subcommand === 'warn') {
    const user = interaction.options.getUser('user', true);
    const reason = interaction.options.getString('reason', true);

    await interaction.deferReply({ ephemeral: true });

    // Try to DM the user about their warning
    try {
      await user.send({
        embeds: [brandedEmbed(interaction, {
          title: `${EMOJIS.warning} You have been warned`,
          description: `You have received a warning in **${interaction.guild.name}**.`,
          color: COLORS.warning,
          fields: [
            { name: `${EMOJIS.ticket} REASON`, value: quote(reason) },
            { name: `${EMOJIS.people} WARNED BY`, value: interaction.user.tag, inline: true },
          ],
        })],
      });
    } catch (dmError) {
      // DM failed - user has DMs disabled, continue anyway
    }

    await auditLog(interaction.client, interaction.guildId, {
      action: 'MOD_WARN',
      actorId: interaction.user.id,
      target: userTarget(user),
      detail: `<@${user.id}> has been warned in \`${interaction.guild.name}\`.`,
      color: COLORS.warning,
      fields: [{ name: `${EMOJIS.ticket} REASON`, value: quote(reason) }],
    });

    await editWithEmbed(interaction, successEmbed(interaction, {
      title: 'Warning issued',
      description: `<@${user.id}> has been warned.`,
      fields: [
        { name: `${EMOJIS.people} TARGET`, value: userTarget(user), inline: true },
        { name: `${EMOJIS.ticket} REASON`, value: quote(reason), inline: true },
      ],
    }));
    return;
  }

  if (subcommand === 'purge') {
    const amount = interaction.options.getInteger('amount', true);
    const targetUser = interaction.options.getUser('user');

    await interaction.deferReply({ ephemeral: true });

    console.log(`[Purge] Channel: ${interaction.channel?.id}, Channel exists: ${!!interaction.channel}`);
    const botMember = await interaction.guild.members.fetch(interaction.client.user.id).catch(() => null);
    console.log(`[Purge] Bot member: ${botMember ? 'found' : 'null'}`);
    const permissions = botMember?.permissionsIn(interaction.channel);
    console.log(`[Purge] Permissions: ${permissions ? 'found' : 'null'}`);
    console.log(`[Purge] Has ManageMessages: ${permissions?.has(PermissionFlagsBits.ManageMessages)}`);
    
    if (!permissions || !permissions.has(PermissionFlagsBits.ManageMessages)) {
      await editWithEmbed(interaction, errorEmbed(interaction, 'I do not have permission to delete messages in this channel.'));
      return;
    }

    let messages;
    if (targetUser) {
      messages = await interaction.channel.messages.fetch({ limit: 100 });
      messages = messages.filter(m => m.author.id === targetUser.id);
      messages = Array.from(messages.values()).slice(0, amount);
    } else {
      messages = await interaction.channel.messages.fetch({ limit: amount });
      messages = Array.from(messages.values());
    }

    if (messages.length === 0) {
      await editWithEmbed(interaction, noticeEmbed(interaction, {
        title: 'No messages to delete',
        description: targetUser 
          ? `No messages from <@${targetUser.id}> found in the last 100 messages.`
          : 'No messages found to delete.',
        color: COLORS.neutral,
      }));
      return;
    }

    await interaction.channel.bulkDelete(messages, true);

    await auditLog(interaction.client, interaction.guildId, {
      action: 'MOD_PURGE',
      actorId: interaction.user.id,
      target: targetUser ? userTarget(targetUser) : `Channel: ${interaction.channel.name}`,
      detail: `${messages.length} message(s) have been purged from ${interaction.channel.name}.`,
      color: COLORS.warning,
      fields: [
        { name: `${EMOJIS.ticket} AMOUNT`, value: `${messages.length} messages`, inline: true },
        { name: `${EMOJIS.ticket} CHANNEL`, value: interaction.channel.name, inline: true },
      ],
    });

    await editWithEmbed(interaction, successEmbed(interaction, {
      title: 'Messages purged',
      description: `${messages.length} message(s) have been deleted from this channel.`,
      fields: [
        { name: `${EMOJIS.ticket} AMOUNT`, value: `${messages.length} messages`, inline: true },
        { name: `${EMOJIS.ticket} CHANNEL`, value: interaction.channel.name, inline: true },
      ],
    }));
    return;
  }
}

module.exports = { moderationCommand, handleModerationCommand, errorEmbed };
