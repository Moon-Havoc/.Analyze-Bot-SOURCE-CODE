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
const WATCHLIST_COLOR = 0xF5A623; // amber/yellow — distinct from blacklist red

const watchlistCommand = new SlashCommandBuilder()
  .setName('watchlist')
  .setDescription('Flag a member or server as suspicious without enforcement.')
  .addSubcommand((subcommand) => subcommand
    .setName('add-member')
    .setDescription('Flag a member as suspicious. No ban is applied.')
    .addUserOption((option) => option
      .setName('user')
      .setDescription('Member to flag')
      .setRequired(true))
    .addStringOption((option) => option
      .setName('reason')
      .setDescription('Why this member is being flagged')
      .setMaxLength(REASON_MAX_LENGTH)
      .setRequired(true)))
  .addSubcommand((subcommand) => subcommand
    .setName('add-server')
    .setDescription('Flag a server as suspicious. The bot will not leave it.')
    .addStringOption((option) => option
      .setName('server_id')
      .setDescription('Discord server ID to flag')
      .setMinLength(17)
      .setMaxLength(20)
      .setRequired(true))
    .addStringOption((option) => option
      .setName('reason')
      .setDescription('Why this server is being flagged')
      .setMaxLength(REASON_MAX_LENGTH)
      .setRequired(true)))
  .addSubcommand((subcommand) => subcommand
    .setName('remove-member')
    .setDescription('Remove a member flag from this server.')
    .addUserOption((option) => option
      .setName('user')
      .setDescription('Member to unflag')
      .setRequired(true)))
  .addSubcommand((subcommand) => subcommand
    .setName('remove-server')
    .setDescription('Remove a server flag.')
    .addStringOption((option) => option
      .setName('server_id')
      .setDescription('Discord server ID to unflag')
      .setMinLength(17)
      .setMaxLength(20)
      .setRequired(true)))
  .addSubcommand((subcommand) => subcommand
    .setName('check-member')
    .setDescription('Check whether a member is flagged in this server.')
    .addUserOption((option) => option
      .setName('user')
      .setDescription('Member to check')
      .setRequired(true)))
  .addSubcommand((subcommand) => subcommand
    .setName('check-server')
    .setDescription('Check whether a server is flagged.')
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

function watchlistRecordEmbed(interaction, {
  title,
  description,
  record,
  target,
  scope,
  color = WATCHLIST_COLOR,
  extraFields = [],
}) {
  const addedAt = timestamp(record);
  const fields = [
    { name: `${EMOJIS.people} TARGET`, value: target, inline: true },
    { name: `${EMOJIS.database} RECORD SCOPE`, value: scope, inline: true },
    { name: `${EMOJIS.online} STATUS`, value: 'Flagged • no enforcement', inline: true },
    { name: `${EMOJIS.ticket} FLAG REASON`, value: quote(record.reason) },
    { name: `${EMOJIS.people} FLAGGED BY`, value: `<@${record.addedBy}>`, inline: true },
    { name: `${EMOJIS.database} FILED`, value: `<t:${addedAt}:F>\n<t:${addedAt}:R>`, inline: true },
    ...extraFields,
  ];
  if (record.notes?.length) {
    fields.push({
      name: `${EMOJIS.question} NOTES (${record.notes.length})`,
      value: record.notes
        .slice(-3)
        .map((note) => `${quote(note.text)}\n— <@${note.authorId}>`)
        .join('\n'),
    });
  }
  return brandedEmbed(interaction, { title, description, color, fields });
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

async function requireManagementPermission(interaction) {
  if (canManage(interaction)) return true;
  await interaction.reply({
    embeds: [noticeEmbed(interaction, {
      title: 'Permission required',
      description: 'You need the **Manage Server** permission to create or remove watchlist flags.',
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

async function handleWatchlistCommand(interaction, store) {
  const subcommand = interaction.options.getSubcommand();
  const isCheck = subcommand.startsWith('check-');

  if (!interaction.inGuild()) {
    await replyWithEmbed(interaction, noticeEmbed(interaction, {
      title: 'Server-only command',
      description: 'Watchlist flags are managed from within a Discord server.',
      color: COLORS.warning,
    }));
    return;
  }

  if (isCheck) {
    await interaction.deferReply({ ephemeral: true });

    if (subcommand === 'check-member') {
      const user = interaction.options.getUser('user', true);
      const record = await store.getMember(interaction.guildId, user.id);
      const allRecords = await store.findMemberAcrossGuilds(user.id);
      const otherField = networkField(allRecords, interaction.guildId, interaction.client);

      let embed;
      if (record) {
        embed = watchlistRecordEmbed(interaction, {
          title: `${EMOJIS.database} Member watchlist flag`,
          description: `<@${user.id}> is flagged as suspicious in this server.`,
          record,
          target: userTarget(user),
          scope: `This server\n\`${interaction.guild.name}\``,
          extraFields: otherField ? [otherField] : [],
        });
      } else if (otherField) {
        embed = brandedEmbed(interaction, {
          title: `${EMOJIS.announce} No local flag — flagged elsewhere`,
          description: `<@${user.id}> is not flagged in this server, but is flagged in other servers on the Investigation Network.`,
          color: COLORS.warning,
          fields: [otherField],
        });
      } else {
        embed = noticeEmbed(interaction, {
          title: 'No flag found',
          description: `<@${user.id}> is not on the watchlist in this server or anywhere else on the Investigation Network.`,
          color: COLORS.neutral,
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
    const record = await store.getGuild(serverId);
    const embed = record
      ? watchlistRecordEmbed(interaction, {
        title: `${EMOJIS.announce} Server watchlist flag`,
        description: 'This server is flagged as suspicious.',
        record,
        target: serverTarget(serverId),
        scope: 'Bot-wide watchlist',
      })
      : noticeEmbed(interaction, {
        title: 'No flag found',
        description: `Server \`${serverId}\` is not on the watchlist.`,
        color: COLORS.neutral,
      });
    await editWithEmbed(interaction, embed);
    return;
  }

  if (!await requireManagementPermission(interaction)) return;
  await interaction.deferReply({ ephemeral: true });

  if (subcommand === 'add-member') {
    const user = interaction.options.getUser('user', true);
    const reason = interaction.options.getString('reason', true);

    if (user.id === interaction.client.user.id) {
      await editWithEmbed(interaction, errorEmbed(interaction, 'I cannot flag myself.'));
      return;
    }

    const record = await store.addMember(interaction.guildId, user.id, {
      reason,
      addedBy: interaction.user.id,
    });

    const embed = watchlistRecordEmbed(interaction, {
      title: `${EMOJIS.check} Member flagged`,
      description: `<@${user.id}> has been added to this server's watchlist.`,
      record,
      target: userTarget(user),
      scope: `This server\n\`${interaction.guild.name}\``,
    });
    await auditLog(interaction.client, interaction.guildId, {
      action: 'WATCHLIST_ADD',
      actorId: interaction.user.id,
      target: userTarget(user),
      detail: `<@${user.id}> has been flagged as suspicious in \`${interaction.guild.name}\`. No enforcement was taken.`,
      color: WATCHLIST_COLOR,
      fields: [{ name: `${EMOJIS.ticket} REASON`, value: quote(reason) }],
    });
    await editWithEmbed(interaction, embed);
    return;
  }

  if (subcommand === 'add-server') {
    const serverId = interaction.options.getString('server_id', true);
    const reason = interaction.options.getString('reason', true);
    if (!isSnowflake(serverId)) {
      await editWithEmbed(interaction, errorEmbed(interaction, 'Provide a valid 17–20 digit Discord server ID.'));
      return;
    }

    const record = await store.addGuild(serverId, { reason, addedBy: interaction.user.id });
    const embed = watchlistRecordEmbed(interaction, {
      title: `${EMOJIS.announce} Server flagged`,
      description: 'The server has been added to the bot-wide watchlist. The bot will remain in it.',
      record,
      target: serverTarget(serverId),
      scope: 'Bot-wide watchlist',
    });
    await auditLog(interaction.client, interaction.guildId, {
      action: 'WATCHLIST_ADD',
      actorId: interaction.user.id,
      target: serverTarget(serverId),
      detail: 'A server has been added to the bot-wide watchlist. No enforcement was taken.',
      color: WATCHLIST_COLOR,
      fields: [{ name: `${EMOJIS.ticket} REASON`, value: quote(reason) }],
    });
    await editWithEmbed(interaction, embed);
    return;
  }

  if (subcommand === 'remove-member') {
    const user = interaction.options.getUser('user', true);
    const removed = await store.removeMember(interaction.guildId, user.id);
    const embed = removed
      ? successEmbed(interaction, {
        title: 'Flag removed',
        description: `<@${user.id}> has been removed from this server's watchlist.`,
        fields: [
          { name: `${EMOJIS.people} TARGET`, value: userTarget(user), inline: true },
          { name: `${EMOJIS.database} RECORD SCOPE`, value: `This server\n\`${interaction.guild.name}\``, inline: true },
        ],
      })
      : noticeEmbed(interaction, {
        title: 'No flag found',
        description: `<@${user.id}> is not on the watchlist in this server.`,
        color: COLORS.neutral,
      });
    if (removed) {
      await auditLog(interaction.client, interaction.guildId, {
        action: 'WATCHLIST_REMOVE',
        actorId: interaction.user.id,
        target: userTarget(user),
        detail: `The watchlist flag for <@${user.id}> has been removed from \`${interaction.guild.name}\`.`,
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
      title: 'Flag removed',
      description: `Server \`${serverId}\` has been removed from the bot-wide watchlist.`,
      fields: [{ name: `${EMOJIS.announce} TARGET`, value: serverTarget(serverId), inline: true }],
    })
    : noticeEmbed(interaction, {
      title: 'No flag found',
      description: `Server \`${serverId}\` is not on the watchlist.`,
      color: COLORS.neutral,
    });
  if (removed) {
    await auditLog(interaction.client, interaction.guildId, {
      action: 'WATCHLIST_REMOVE',
      actorId: interaction.user.id,
      target: serverTarget(serverId),
      detail: `Server \`${serverId}\` has been removed from the bot-wide watchlist.`,
      color: COLORS.warning,
    });
  }
  await editWithEmbed(interaction, embed);
}

module.exports = { watchlistCommand, errorEmbed, handleWatchlistCommand, WATCHLIST_COLOR };
