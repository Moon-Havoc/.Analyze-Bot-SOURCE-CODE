const { PermissionFlagsBits, SlashCommandBuilder } = require('discord.js');
const {
  COLORS,
  EMOJIS,
  NO_MENTIONS,
  brandedEmbed,
  noticeEmbed,
} = require('./brand');
const { auditLog } = require('./audit');

const REASON_MAX_LENGTH = 500;

const blacklistCommand = new SlashCommandBuilder()
  .setName('blacklist')
  .setDescription('Blacklist a member from this server or block the bot from a server.')
  .addSubcommand((subcommand) => subcommand
    .setName('member')
    .setDescription('Blacklist and ban a member from this server.')
    .addUserOption((option) => option
      .setName('user')
      .setDescription('Member to blacklist')
      .setRequired(true))
    .addStringOption((option) => option
      .setName('reason')
      .setDescription('Why this member is being blacklisted')
      .setMaxLength(REASON_MAX_LENGTH)
      .setRequired(true)))
  .addSubcommand((subcommand) => subcommand
    .setName('server')
    .setDescription('Block the bot from joining or remaining in a Discord server.')
    .addStringOption((option) => option
      .setName('server_id')
      .setDescription('Discord server ID to blacklist')
      .setMinLength(17)
      .setMaxLength(20)
      .setRequired(true))
    .addStringOption((option) => option
      .setName('reason')
      .setDescription('Why this server is being blacklisted')
      .setMaxLength(REASON_MAX_LENGTH)
      .setRequired(true)))
  .addSubcommand((subcommand) => subcommand
    .setName('remove-member')
    .setDescription('Remove a member from this server blacklist.')
    .addUserOption((option) => option
      .setName('user')
      .setDescription('Member to remove')
      .setRequired(true)))
  .addSubcommand((subcommand) => subcommand
    .setName('remove-server')
    .setDescription('Remove a server from the bot-wide blacklist.')
    .addStringOption((option) => option
      .setName('server_id')
      .setDescription('Discord server ID to remove')
      .setMinLength(17)
      .setMaxLength(20)
      .setRequired(true)))
  .addSubcommand((subcommand) => subcommand
    .setName('check-member')
    .setDescription('Check whether a member is blacklisted in this server.')
    .addUserOption((option) => option
      .setName('user')
      .setDescription('Member to check')
      .setRequired(true)))
  .addSubcommand((subcommand) => subcommand
    .setName('check-server')
    .setDescription('Check whether a Discord server is blacklisted.')
    .addStringOption((option) => option
      .setName('server_id')
      .setDescription('Discord server ID to check')
      .setMinLength(17)
      .setMaxLength(20)
      .setRequired(true)));

function isSnowflake(value) {
  return /^\d{17,20}$/.test(value);
}

function canManage(interaction) {
  return interaction.inGuild()
    && interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild);
}

/**
 * Checks whether the member holds the configured Investigation Team role, or
 * any role positioned higher than it in the server's role hierarchy (Settings
 * > Roles — higher in that list = higher position). Administrators always
 * pass, matching how Discord's own permission system treats Administrator as
 * a hierarchy bypass.
 *
 * If INVESTIGATION_ROLE_ID isn't configured, or the configured role can't be
 * found, this falls back to the previous Manage Server check rather than
 * silently allowing (or blocking) everyone.
 */
async function canAccessBlacklist(interaction) {
  if (!interaction.inGuild()) return false;
  if (interaction.memberPermissions?.has(PermissionFlagsBits.Administrator)) return true;

  const roleId = process.env.INVESTIGATION_ROLE_ID;
  if (!roleId) return canManage(interaction);

  if (interaction.member.roles.cache.has(roleId)) return true;

  const thresholdRole = interaction.guild.roles.cache.get(roleId)
    ?? await interaction.guild.roles.fetch(roleId).catch(() => null);
  if (!thresholdRole) return canManage(interaction);

  const highestPosition = interaction.member.roles.highest?.position ?? 0;
  return highestPosition > thresholdRole.position;
}

function timestamp(record) {
  return Math.floor(Date.parse(record.addedAt) / 1000);
}

function quote(value) {
  return `> ${value.replace(/\n/g, '\n> ')}`;
}

function userTarget(user) {
  return `<@${user.id}>\n\`${user.username}\`\n\`${user.id}\``;
}

function serverTarget(serverId) {
  return `\`${serverId}\``;
}

function networkField(records, currentGuildId, client) {
  const others = records.filter((r) => r.guildId !== currentGuildId);
  if (!others.length) return null;
  const lines = others.slice(0, 5).map((r) => {
    const guildName = client.guilds.cache.get(r.guildId)?.name ?? `Unknown server (\`${r.guildId}\`)`;
    const addedAt = Math.floor(Date.parse(r.addedAt) / 1000);
    return `**${guildName}** • <t:${addedAt}:R>\n${quote(r.reason)}`;
  }).join('\n');
  return {
    name: `${EMOJIS.announce} ALSO FLAGGED IN OTHER NETWORK SERVERS (${others.length})`,
    value: others.length > 5 ? `${lines}\n…and ${others.length - 5} more.` : lines,
  };
}

function blacklistRecordEmbed(interaction, {
  title,
  description,
  record,
  target,
  scope,
  enforcement,
  color = COLORS.danger,
  extraFields = [],
}) {
  const addedAt = timestamp(record);
  return brandedEmbed(interaction, {
    title,
    description,
    color,
    fields: [
      { name: `${EMOJIS.people} TARGET`, value: target, inline: true },
      { name: `${EMOJIS.database} RECORD SCOPE`, value: scope, inline: true },
      { name: `${EMOJIS.online} ENFORCEMENT`, value: enforcement, inline: true },
      { name: `${EMOJIS.ticket} CASE REASON`, value: quote(record.reason) },
      { name: `${EMOJIS.people} RECORDED BY`, value: `<@${record.addedBy}>`, inline: true },
      { name: `${EMOJIS.database} FILED`, value: `<t:${addedAt}:F>\n<t:${addedAt}:R>`, inline: true },
      ...extraFields,
    ],
  });
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
    color: COLORS.warning,
  });
}

async function requireInvestigationAccess(interaction) {
  if (await canAccessBlacklist(interaction)) return true;
  await interaction.reply({
    embeds: [noticeEmbed(interaction, {
      title: 'Investigation access required',
      description: 'You need the **Investigation Team** role (or a higher-ranked role) to use blacklist commands.',
      color: COLORS.warning,
    })],
    ephemeral: true,
    allowedMentions: NO_MENTIONS,
  });
  return false;
}

async function replyWithEmbed(interaction, embed) {
  await interaction.reply({ embeds: [embed], ephemeral: true, allowedMentions: NO_MENTIONS });
}

async function editWithEmbed(interaction, embed) {
  await interaction.editReply({ embeds: [embed], allowedMentions: NO_MENTIONS });
}

async function handleBlacklistCommand(interaction, store) {
  const subcommand = interaction.options.getSubcommand();
  const isCheck = subcommand.startsWith('check-');

  if (!interaction.inGuild()) {
    await replyWithEmbed(interaction, noticeEmbed(interaction, {
      title: 'Server-only command',
      description: 'Blacklist intelligence is managed from within a Discord server.',
      color: COLORS.warning,
    }));
    return;
  }

  if (!await requireInvestigationAccess(interaction)) return;

  if (isCheck) {
    if (subcommand === 'check-member') {
      const user = interaction.options.getUser('user', true);
      const record = await store.getMember(interaction.guildId, user.id);
      const allRecords = await store.findMemberAcrossGuilds(user.id);
      const otherField = networkField(allRecords, interaction.guildId, interaction.client);

      let embed;
      if (record) {
        embed = blacklistRecordEmbed(interaction, {
          title: `${EMOJIS.database} Member blacklist record`,
          description: `An active blacklist record was found for <@${user.id}> in this server.`,
          record,
          target: userTarget(user),
          scope: `This server\n\`${interaction.guild.name}\``,
          enforcement: 'Active • rejoin protection enabled',
          extraFields: otherField ? [otherField] : [],
        });
      } else if (otherField) {
        embed = brandedEmbed(interaction, {
          title: `${EMOJIS.announce} No local record — flagged elsewhere`,
          description: `<@${user.id}> has no blacklist record in this server, but is flagged in other servers on the Investigation Network.`,
          color: COLORS.warning,
          fields: [otherField],
        });
      } else {
        embed = noticeEmbed(interaction, {
          title: 'No member record found',
          description: `<@${user.id}> does not have an active blacklist record in this server or anywhere else on the Investigation Network.`,
          color: COLORS.neutral,
        });
      }
      await replyWithEmbed(interaction, embed);
      return;
    }

    const serverId = interaction.options.getString('server_id', true);
    if (!isSnowflake(serverId)) {
      await replyWithEmbed(interaction, errorEmbed(interaction, 'Provide a valid 17–20 digit Discord server ID.'));
      return;
    }
    const record = await store.getGuild(serverId);
    const embed = record
      ? blacklistRecordEmbed(interaction, {
        title: `${EMOJIS.announce} Server blacklist record`,
        description: 'This server is on the bot-wide denylist.',
        record,
        target: serverTarget(serverId),
        scope: 'Bot-wide denylist',
        enforcement: 'Active • bot access denied',
      })
      : noticeEmbed(interaction, {
        title: 'No server record found',
        description: `Server \`${serverId}\` does not have an active blacklist record.`,
        color: COLORS.neutral,
      });
    await replyWithEmbed(interaction, embed);
    return;
  }

  await interaction.deferReply({ ephemeral: true });

  if (subcommand === 'member') {
    const user = interaction.options.getUser('user', true);
    const reason = interaction.options.getString('reason', true);

    if (user.id === interaction.client.user.id) {
      await editWithEmbed(interaction, errorEmbed(interaction, 'I cannot create a blacklist record for myself.'));
      return;
    }

    const record = await store.addMember(interaction.guildId, user.id, {
      reason,
      addedBy: interaction.user.id,
    });

    const member = await interaction.guild.members.fetch(user.id).catch(() => null);
    let enforcement = 'Active • rejoin protection enabled';
    if (member?.bannable) {
      await member.ban({ reason: `Blacklisted by ${interaction.user.tag}: ${reason}` });
      enforcement = 'Active • member banned';
    } else if (member) {
      enforcement = 'Record saved • unable to ban (check bot permissions and role position)';
    } else {
      enforcement = 'Active • member is not currently in this server';
    }

    const embed = blacklistRecordEmbed(interaction, {
      title: `${EMOJIS.check} Member blacklisted`,
      description: `A blacklist record has been created for <@${user.id}>.`,
      record,
      target: userTarget(user),
      scope: `This server\n\`${interaction.guild.name}\``,
      enforcement,
    });
    await auditLog(interaction.client, interaction.guildId, {
      action: 'BLACKLIST_ADD',
      actorId: interaction.user.id,
      target: userTarget(user),
      detail: `A member blacklist record has been created for <@${user.id}> in \`${interaction.guild.name}\`.`,
      color: COLORS.danger,
      fields: [
        { name: `${EMOJIS.ticket} REASON`, value: quote(reason) },
        { name: `${EMOJIS.online} ENFORCEMENT`, value: enforcement, inline: true },
      ],
    });
    await editWithEmbed(interaction, embed);
    return;
  }

  if (subcommand === 'server') {
    const serverId = interaction.options.getString('server_id', true);
    const reason = interaction.options.getString('reason', true);
    if (!isSnowflake(serverId)) {
      await editWithEmbed(interaction, errorEmbed(interaction, 'Provide a valid 17–20 digit Discord server ID.'));
      return;
    }
    if (serverId === interaction.guildId) {
      await editWithEmbed(interaction, errorEmbed(interaction, 'You cannot blacklist the server where you ran this command. Remove the bot instead if needed.'));
      return;
    }

    const record = await store.addGuild(serverId, { reason, addedBy: interaction.user.id });
    const guild = interaction.client.guilds.cache.get(serverId);
    const embed = blacklistRecordEmbed(interaction, {
      title: `${EMOJIS.announce} Server blacklisted`,
      description: 'The server has been added to the bot-wide denylist.',
      record,
      target: serverTarget(serverId),
      scope: 'Bot-wide denylist',
      enforcement: guild ? 'Active • bot is leaving this server' : 'Active • future access denied',
    });
    await auditLog(interaction.client, interaction.guildId, {
      action: 'BLACKLIST_ADD',
      actorId: interaction.user.id,
      target: serverTarget(serverId),
      detail: 'A server has been added to the bot-wide denylist.',
      color: COLORS.danger,
      fields: [{ name: `${EMOJIS.ticket} REASON`, value: quote(reason) }],
    });
    await editWithEmbed(interaction, embed);
    if (guild) await guild.leave().catch(() => null);
    return;
  }

  if (subcommand === 'remove-member') {
    const user = interaction.options.getUser('user', true);
    const removed = await store.removeMember(interaction.guildId, user.id);
    const embed = removed
      ? successEmbed(interaction, {
        title: 'Member record removed',
        description: `<@${user.id}> has been removed from this server's blacklist. Existing bans are unchanged.`,
        fields: [
          { name: `${EMOJIS.people} TARGET`, value: userTarget(user), inline: true },
          { name: `${EMOJIS.database} RECORD SCOPE`, value: `This server\n\`${interaction.guild.name}\``, inline: true },
          { name: `${EMOJIS.online} ENFORCEMENT`, value: 'Blacklist protection disabled', inline: true },
        ],
      })
      : noticeEmbed(interaction, {
        title: 'No member record found',
        description: `<@${user.id}> does not have an active blacklist record in this server.`,
        color: COLORS.neutral,
      });
    if (removed) {
      await auditLog(interaction.client, interaction.guildId, {
        action: 'BLACKLIST_REMOVE',
        actorId: interaction.user.id,
        target: userTarget(user),
        detail: `The member blacklist record for <@${user.id}> has been removed from \`${interaction.guild.name}\`.`,
        color: COLORS.warning,
      });
    }
    await editWithEmbed(interaction, embed);
    return;
  }

  const serverId = interaction.options.getString('server_id', true);
  if (!isSnowflake(serverId)) {
    await editWithEmbed(interaction, errorEmbed(interaction, 'Provide a valid 17–20 digit Discord server ID.'));
    return;
  }
  const removed = await store.removeGuild(serverId);
  const embed = removed
    ? successEmbed(interaction, {
      title: 'Server record removed',
      description: `Server \`${serverId}\` has been removed from the bot-wide denylist.`,
      fields: [
        { name: `${EMOJIS.announce} TARGET`, value: serverTarget(serverId), inline: true },
        { name: `${EMOJIS.database} RECORD SCOPE`, value: 'Bot-wide denylist', inline: true },
        { name: `${EMOJIS.online} ENFORCEMENT`, value: 'Bot access restored', inline: true },
      ],
    })
    : noticeEmbed(interaction, {
      title: 'No server record found',
      description: `Server \`${serverId}\` does not have an active blacklist record.`,
      color: COLORS.neutral,
    });
  if (removed) {
    await auditLog(interaction.client, interaction.guildId, {
      action: 'BLACKLIST_REMOVE',
      actorId: interaction.user.id,
      target: serverTarget(serverId),
      detail: `Server \`${serverId}\` has been removed from the bot-wide denylist.`,
      color: COLORS.warning,
    });
  }
  await editWithEmbed(interaction, embed);
}

module.exports = { blacklistCommand, errorEmbed, handleBlacklistCommand };
