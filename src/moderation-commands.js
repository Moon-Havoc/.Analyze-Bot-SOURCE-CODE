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
  .addSubcommand((subcommand) => subcommand
    .setName('lock')
    .setDescription('Lock the current channel (prevent @everyone from sending messages).')
    .addStringOption((option) => option
      .setName('reason')
      .setDescription('Reason for locking the channel')
      .setMaxLength(500)
      .setRequired(false)))
  .addSubcommand((subcommand) => subcommand
    .setName('unlock')
    .setDescription('Unlock the current channel (allow @everyone to send messages).')
    .addStringOption((option) => option
      .setName('reason')
      .setDescription('Reason for unlocking the channel')
      .setMaxLength(500)
      .setRequired(false)))
  .addSubcommand((subcommand) => subcommand
    .setName('slowmode')
    .setDescription('Set slowmode for the current channel.')
    .addIntegerOption((option) => option
      .setName('seconds')
      .setDescription('Slowmode duration in seconds (0 to disable)')
      .setMinValue(0)
      .setMaxValue(21600) // 6 hours max
      .setRequired(true)))
  .addSubcommand((subcommand) => subcommand
    .setName('nickname')
    .setDescription('Change a member\'s nickname.')
    .addUserOption((option) => option
      .setName('user')
      .setDescription('Member to rename')
      .setRequired(true))
    .addStringOption((option) => option
      .setName('nickname')
      .setDescription('New nickname (leave empty to reset)')
      .setMaxLength(32)
      .setRequired(false)))
  .addSubcommand((subcommand) => subcommand
    .setName('addrole')
    .setDescription('Add a role to a member.')
    .addUserOption((option) => option
      .setName('user')
      .setDescription('Member to add role to')
      .setRequired(true))
    .addRoleOption((option) => option
      .setName('role')
      .setDescription('Role to add')
      .setRequired(true)))
  .addSubcommand((subcommand) => subcommand
    .setName('removerole')
    .setDescription('Remove a role from a member.')
    .addUserOption((option) => option
      .setName('user')
      .setDescription('Member to remove role from')
      .setRequired(true))
    .addRoleOption((option) => option
      .setName('role')
      .setDescription('Role to remove')
      .setRequired(true)))
  .addSubcommand((subcommand) => subcommand
    .setName('info')
    .setDescription('Get information about a member.')
    .addUserOption((option) => option
      .setName('user')
      .setDescription('Member to get info for')
      .setRequired(true)))
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
  if (interaction.memberPermissions?.has(PermissionFlagsBits.Administrator)) return true;
  
  // Check for management team role
  if (interaction.member.roles.cache.has(MANAGEMENT_ROLE_ID)) return true;
  
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

    const botMember = await interaction.guild.members.fetch(interaction.client.user.id).catch(() => null);
    const permissions = botMember?.permissionsIn(interaction.channel);
    
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

  if (subcommand === 'lock') {
    const reason = interaction.options.getString('reason') ?? 'No reason provided';

    await interaction.deferReply({ ephemeral: true });

    const botMember = await interaction.guild.members.fetch(interaction.client.user.id).catch(() => null);
    const permissions = botMember?.permissionsIn(interaction.channel);
    
    if (!permissions || !permissions.has(PermissionFlagsBits.ManageChannels)) {
      await editWithEmbed(interaction, errorEmbed(interaction, 'I do not have permission to manage this channel.'));
      return;
    }

    await interaction.channel.permissionOverwrites.edit(interaction.guild.roles.everyone, {
      SendMessages: false,
    }, `Locked by ${interaction.user.tag}: ${reason}`);

    await auditLog(interaction.client, interaction.guildId, {
      action: 'MOD_LOCK',
      actorId: interaction.user.id,
      target: `Channel: ${interaction.channel.name}`,
      detail: `<@${interaction.user.id}> locked ${interaction.channel.name}.`,
      color: COLORS.warning,
      fields: [{ name: `${EMOJIS.ticket} REASON`, value: quote(reason) }],
    });

    await editWithEmbed(interaction, successEmbed(interaction, {
      title: 'Channel locked',
      description: `${interaction.channel.name} has been locked. @everyone can no longer send messages.`,
      fields: [
        { name: `${EMOJIS.ticket} CHANNEL`, value: interaction.channel.name, inline: true },
        { name: `${EMOJIS.ticket} REASON`, value: quote(reason), inline: true },
      ],
    }));
    return;
  }

  if (subcommand === 'unlock') {
    const reason = interaction.options.getString('reason') ?? 'No reason provided';

    await interaction.deferReply({ ephemeral: true });

    const botMember = await interaction.guild.members.fetch(interaction.client.user.id).catch(() => null);
    const permissions = botMember?.permissionsIn(interaction.channel);
    
    if (!permissions || !permissions.has(PermissionFlagsBits.ManageChannels)) {
      await editWithEmbed(interaction, errorEmbed(interaction, 'I do not have permission to manage this channel.'));
      return;
    }

    await interaction.channel.permissionOverwrites.edit(interaction.guild.roles.everyone, {
      SendMessages: null,
    }, `Unlocked by ${interaction.user.tag}: ${reason}`);

    await auditLog(interaction.client, interaction.guildId, {
      action: 'MOD_UNLOCK',
      actorId: interaction.user.id,
      target: `Channel: ${interaction.channel.name}`,
      detail: `<@${interaction.user.id}> unlocked ${interaction.channel.name}.`,
      color: COLORS.success,
      fields: [{ name: `${EMOJIS.ticket} REASON`, value: quote(reason) }],
    });

    await editWithEmbed(interaction, successEmbed(interaction, {
      title: 'Channel unlocked',
      description: `${interaction.channel.name} has been unlocked. @everyone can now send messages.`,
      fields: [
        { name: `${EMOJIS.ticket} CHANNEL`, value: interaction.channel.name, inline: true },
        { name: `${EMOJIS.ticket} REASON`, value: quote(reason), inline: true },
      ],
    }));
    return;
  }

  if (subcommand === 'slowmode') {
    const seconds = interaction.options.getInteger('seconds', true);

    await interaction.deferReply({ ephemeral: true });

    const botMember = await interaction.guild.members.fetch(interaction.client.user.id).catch(() => null);
    const permissions = botMember?.permissionsIn(interaction.channel);
    
    if (!permissions || !permissions.has(PermissionFlagsBits.ManageChannels)) {
      await editWithEmbed(interaction, errorEmbed(interaction, 'I do not have permission to manage this channel.'));
      return;
    }

    await interaction.channel.setRateLimitPerUser(seconds, `Slowmode set by ${interaction.user.tag}`);

    await auditLog(interaction.client, interaction.guildId, {
      action: 'MOD_SLOWMODE',
      actorId: interaction.user.id,
      target: `Channel: ${interaction.channel.name}`,
      detail: `<@${interaction.user.id}> set slowmode in ${interaction.channel.name} to ${seconds} seconds.`,
      color: seconds > 0 ? COLORS.warning : COLORS.success,
      fields: [{ name: `${EMOJIS.ticket} DURATION`, value: seconds === 0 ? 'Disabled' : `${seconds} seconds`, inline: true }],
    });

    await editWithEmbed(interaction, successEmbed(interaction, {
      title: 'Slowmode updated',
      description: `${interaction.channel.name} slowmode has been set to ${seconds === 0 ? 'disabled' : `${seconds} seconds`}.`,
      fields: [
        { name: `${EMOJIS.ticket} CHANNEL`, value: interaction.channel.name, inline: true },
        { name: `${EMOJIS.ticket} DURATION`, value: seconds === 0 ? 'Disabled' : `${seconds} seconds`, inline: true },
      ],
    }));
    return;
  }

  if (subcommand === 'nickname') {
    const user = interaction.options.getUser('user', true);
    const nickname = interaction.options.getString('nickname');

    await interaction.deferReply({ ephemeral: true });

    const member = await interaction.guild.members.fetch(user.id).catch(() => null);
    if (!member) {
      await editWithEmbed(interaction, errorEmbed(interaction, 'This member is not in the server.'));
      return;
    }

    if (!member.manageable) {
      await editWithEmbed(interaction, errorEmbed(interaction, 'I cannot change this member\'s nickname. Check my role position and permissions.'));
      return;
    }

    await member.setNickname(nickname || null, `Nickname changed by ${interaction.user.tag}`);

    await auditLog(interaction.client, interaction.guildId, {
      action: 'MOD_NICKNAME',
      actorId: interaction.user.id,
      target: userTarget(user),
      detail: `<@${interaction.user.id}> changed ${user.username}'s nickname to ${nickname ? `"${nickname}"` : 'default'}.`,
      color: COLORS.brand,
      fields: [{ name: `${EMOJIS.ticket} NEW NICKNAME`, value: nickname || 'Reset to default', inline: true }],
    });

    await editWithEmbed(interaction, successEmbed(interaction, {
      title: 'Nickname updated',
      description: `<@${user.id}>'s nickname has been ${nickname ? 'changed' : 'reset'}.`,
      fields: [
        { name: `${EMOJIS.people} TARGET`, value: userTarget(user), inline: true },
        { name: `${EMOJIS.ticket} NEW NICKNAME`, value: nickname || 'Reset to default', inline: true },
      ],
    }));
    return;
  }

  if (subcommand === 'addrole') {
    const user = interaction.options.getUser('user', true);
    const role = interaction.options.getRole('role', true);

    await interaction.deferReply({ ephemeral: true });

    const member = await interaction.guild.members.fetch(user.id).catch(() => null);
    if (!member) {
      await editWithEmbed(interaction, errorEmbed(interaction, 'This member is not in the server.'));
      return;
    }

    if (member.roles.cache.has(role.id)) {
      await editWithEmbed(interaction, noticeEmbed(interaction, {
        title: 'Role already assigned',
        description: `<@${user.id}> already has the ${role.name} role.`,
        color: COLORS.neutral,
      }));
      return;
    }

    if (!member.manageable) {
      await editWithEmbed(interaction, errorEmbed(interaction, 'I cannot manage this member. Check my role position and permissions.'));
      return;
    }

    if (role.position >= interaction.guild.members.me.roles.highest.position) {
      await editWithEmbed(interaction, errorEmbed(interaction, 'I cannot assign a role that is higher than or equal to my highest role.'));
      return;
    }

    await member.roles.add(role, `Role added by ${interaction.user.tag}`);

    await auditLog(interaction.client, interaction.guildId, {
      action: 'MOD_ADDROLE',
      actorId: interaction.user.id,
      target: userTarget(user),
      detail: `<@${interaction.user.id}> added ${role.name} role to <@${user.id}>.`,
      color: COLORS.success,
      fields: [{ name: `${EMOJIS.ticket} ROLE`, value: role.name, inline: true }],
    });

    await editWithEmbed(interaction, successEmbed(interaction, {
      title: 'Role added',
      description: `${role.name} has been added to <@${user.id}>.`,
      fields: [
        { name: `${EMOJIS.people} TARGET`, value: userTarget(user), inline: true },
        { name: `${EMOJIS.ticket} ROLE`, value: role.name, inline: true },
      ],
    }));
    return;
  }

  if (subcommand === 'removerole') {
    const user = interaction.options.getUser('user', true);
    const role = interaction.options.getRole('role', true);

    await interaction.deferReply({ ephemeral: true });

    const member = await interaction.guild.members.fetch(user.id).catch(() => null);
    if (!member) {
      await editWithEmbed(interaction, errorEmbed(interaction, 'This member is not in the server.'));
      return;
    }

    if (!member.roles.cache.has(role.id)) {
      await editWithEmbed(interaction, noticeEmbed(interaction, {
        title: 'Role not assigned',
        description: `<@${user.id}> does not have the ${role.name} role.`,
        color: COLORS.neutral,
      }));
      return;
    }

    if (!member.manageable) {
      await editWithEmbed(interaction, errorEmbed(interaction, 'I cannot manage this member. Check my role position and permissions.'));
      return;
    }

    if (role.position >= interaction.guild.members.me.roles.highest.position) {
      await editWithEmbed(interaction, errorEmbed(interaction, 'I cannot remove a role that is higher than or equal to my highest role.'));
      return;
    }

    await member.roles.remove(role, `Role removed by ${interaction.user.tag}`);

    await auditLog(interaction.client, interaction.guildId, {
      action: 'MOD_REMOVEROLE',
      actorId: interaction.user.id,
      target: userTarget(user),
      detail: `<@${interaction.user.id}> removed ${role.name} role from <@${user.id}>.`,
      color: COLORS.warning,
      fields: [{ name: `${EMOJIS.ticket} ROLE`, value: role.name, inline: true }],
    });

    await editWithEmbed(interaction, successEmbed(interaction, {
      title: 'Role removed',
      description: `${role.name} has been removed from <@${user.id}>.`,
      fields: [
        { name: `${EMOJIS.people} TARGET`, value: userTarget(user), inline: true },
        { name: `${EMOJIS.ticket} ROLE`, value: role.name, inline: true },
      ],
    }));
    return;
  }

  if (subcommand === 'info') {
    const user = interaction.options.getUser('user', true);

    await interaction.deferReply({ ephemeral: true });

    const member = await interaction.guild.members.fetch(user.id).catch(() => null);
    const joinedAt = member?.joinedAt ? Math.floor(member.joinedAt.getTime() / 1000) : 'N/A';
    const createdAt = Math.floor(user.createdAt.getTime() / 1000);
    const roles = member ? member.roles.cache.filter(r => r.id !== interaction.guild.id).map(r => r.name).join(', ') : 'N/A';
    const isBot = user.bot ? 'Yes' : 'No';

    const fields = [
      { name: `${EMOJIS.people} USERNAME`, value: user.username, inline: true },
      { name: `${EMOJIS.people} DISPLAY NAME`, value: user.displayName, inline: true },
      { name: `${EMOJIS.people} ID`, value: user.id, inline: true },
      { name: `${EMOJIS.people} BOT`, value: isBot, inline: true },
      { name: `${EMOJIS.online} ACCOUNT CREATED`, value: `<t:${createdAt}:F>\n<t:${createdAt}:R>`, inline: true },
      { name: `${EMOJIS.online} JOINED SERVER`, value: joinedAt !== 'N/A' ? `<t:${joinedAt}:F>\n<t:${joinedAt}:R>` : 'N/A', inline: true },
    ];

    if (roles && roles !== 'N/A') {
      fields.push({ name: `${EMOJIS.ticket} ROLES (${member.roles.cache.size - 1})`, value: roles.slice(0, 20) });
    }

    await editWithEmbed(interaction, brandedEmbed(interaction, {
      title: `${EMOJIS.people} Member Information`,
      description: `Information for <@${user.id}>`,
      color: COLORS.brand,
      fields,
    }));
    return;
  }
}

module.exports = { moderationCommand, handleModerationCommand, errorEmbed };
