const { SlashCommandBuilder } = require('discord.js');
const { COLORS, EMOJIS, NO_MENTIONS, brandedEmbed, noticeEmbed } = require('./brand');
const { auditLog } = require('./audit');
const { fetchRobloxUser } = require('./roblox');

const lookupCommand = new SlashCommandBuilder()
  .setName('lookup')
  .setDescription('Cross-reference a subject across all .analyze systems.')
  .addSubcommand((subcommand) => subcommand
    .setName('user')
    .setDescription('Look up a Discord user across all systems.')
    .addUserOption((option) => option
      .setName('user')
      .setDescription('Discord member to look up')
      .setRequired(true)))
  .addSubcommand((subcommand) => subcommand
    .setName('server')
    .setDescription('Look up a Discord server across all systems.')
    .addStringOption((option) => option
      .setName('server_id')
      .setDescription('Discord server ID to look up')
      .setMinLength(17)
      .setMaxLength(20)
      .setRequired(true)))
  .addSubcommand((subcommand) => subcommand
    .setName('roblox')
    .setDescription('Look up a Roblox user and cross-reference any linked Discord records.')
    .addStringOption((option) => option
      .setName('username')
      .setDescription('Roblox username')
      .setRequired(true)));

function isSnowflake(value) {
  return /^\d{17,20}$/.test(value);
}

function quote(value) {
  return `> ${value.replace(/\n/g, '\n> ')}`;
}

function noRecordsField(name) {
  return { name, value: 'No records found.' };
}

function networkLines(records, currentGuildId, client) {
  const others = records.filter((r) => r.guildId !== currentGuildId);
  if (!others.length) return '';
  const lines = others.slice(0, 3).map((r) => {
    const guildName = client.guilds.cache.get(r.guildId)?.name ?? `Unknown server (\`${r.guildId}\`)`;
    return `${guildName} — ${quote(r.reason)}`;
  }).join('\n');
  return `\n${EMOJIS.announce} **Also flagged in ${others.length} other network server(s):**\n${lines}${others.length > 3 ? `\n…and ${others.length - 3} more.` : ''}`;
}

async function blacklistSection(stores, { scope, id }, client) {
  const record = scope === 'member'
    ? await stores.blacklist.getMember(id.guildId, id.userId)
    : await stores.blacklist.getGuild(id.serverId);

  const network = scope === 'member' && client
    ? networkLines(await stores.blacklist.findMemberAcrossGuilds(id.userId), id.guildId, client)
    : '';

  if (!record) {
    if (!network) return noRecordsField(`${EMOJIS.announce} BLACKLIST`);
    return { name: `${EMOJIS.announce} BLACKLIST`, value: `No local record in this server.${network}` };
  }

  const addedAt = Math.floor(Date.parse(record.addedAt) / 1000);
  return {
    name: `${EMOJIS.announce} BLACKLIST`,
    value: `**Active record** • <t:${addedAt}:R>\n${quote(record.reason)}${network}`,
  };
}

async function watchlistSection(stores, { scope, id }, client) {
  const record = scope === 'member'
    ? await stores.watchlist.getMember(id.guildId, id.userId)
    : await stores.watchlist.getGuild(id.serverId);

  const network = scope === 'member' && client
    ? networkLines(await stores.watchlist.findMemberAcrossGuilds(id.userId), id.guildId, client)
    : '';

  if (!record) {
    if (!network) return noRecordsField(`${EMOJIS.database} WATCHLIST`);
    return { name: `${EMOJIS.database} WATCHLIST`, value: `No local flag in this server.${network}` };
  }

  const addedAt = Math.floor(Date.parse(record.addedAt) / 1000);
  const noteCount = record.notes?.length ? ` • ${record.notes.length} note(s)` : '';
  return {
    name: `${EMOJIS.database} WATCHLIST`,
    value: `**Flagged** • <t:${addedAt}:R>${noteCount}\n${quote(record.reason)}${network}`,
  };
}

async function ticketsSection(stores, guildId, userId) {
  const allTickets = await stores.ticket.getTicketsByOwner(guildId, userId);
  if (!allTickets.length) return noRecordsField(`${EMOJIS.ticket} TICKETS`);

  const open = allTickets.filter((ticket) => ticket.status === 'open').length;
  const closed = allTickets.length - open;
  const mostRecent = allTickets.sort((first, second) => second.number - first.number)[0];
  return {
    name: `${EMOJIS.ticket} TICKETS`,
    value: `**${allTickets.length} total** — ${open} open, ${closed} closed\nMost recent: #${mostRecent.number} — ${mostRecent.subject}`,
  };
}

async function casesSection(stores, guildId, linkedId) {
  const cases = await stores.case.findCasesByLinkedId(guildId, linkedId);
  if (!cases.length) return noRecordsField(`${EMOJIS.database} CASES`);

  const summary = cases
    .slice(0, 10)
    .map((record) => `**#${record.number}** • ${record.status === 'open' ? 'Open' : 'Closed'} — ${record.subject}`)
    .join('\n');
  return { name: `${EMOJIS.database} CASES (${cases.length})`, value: summary };
}

async function robloxSection(username) {
  const profile = await fetchRobloxUser(username).catch(() => null);
  if (!profile) return noRecordsField(`${EMOJIS.people} ROBLOX`);

  const createdAt = Math.floor(Date.parse(profile.created) / 1000);
  return {
    name: `${EMOJIS.people} ROBLOX`,
    value: `**${profile.displayName}** (\`${profile.name}\`, \`${profile.id}\`)\nCreated <t:${createdAt}:R>${profile.isBanned ? '\n**Banned on Roblox**' : ''}\n[View profile](https://www.roblox.com/users/${profile.id}/profile)`,
  };
}

async function replyWithEmbed(interaction, embed) {
  await interaction.editReply({ embeds: [embed], allowedMentions: NO_MENTIONS });
}

async function handleLookupCommand(interaction, stores) {
  const subcommand = interaction.options.getSubcommand();

  if (!interaction.inGuild()) {
    await interaction.reply({
      embeds: [noticeEmbed(interaction, {
        title: 'Server-only command',
        description: 'Unified lookups are run from within a Discord server.',
        color: COLORS.warning,
      })],
      ephemeral: true,
      allowedMentions: NO_MENTIONS,
    });
    return;
  }

  await interaction.deferReply({ ephemeral: true });

  if (subcommand === 'user') {
    const user = interaction.options.getUser('user', true);
    const guildId = interaction.guildId;
    const id = { guildId, userId: user.id };

    const fields = await Promise.all([
      blacklistSection(stores, { scope: 'member', id }, interaction.client),
      watchlistSection(stores, { scope: 'member', id }, interaction.client),
      ticketsSection(stores, guildId, user.id),
      casesSection(stores, guildId, user.id),
    ]);

    const embed = brandedEmbed(interaction, {
      title: `${EMOJIS.people} Unified lookup — ${user.username}`,
      description: `Cross-system results for <@${user.id}> (\`${user.id}\`) in this server.`,
      color: COLORS.brand,
      fields,
    });
    await replyWithEmbed(interaction, embed);
  } else if (subcommand === 'server') {
    const serverId = interaction.options.getString('server_id', true);
    if (!isSnowflake(serverId)) {
      await replyWithEmbed(interaction, noticeEmbed(interaction, {
        title: 'Invalid server ID',
        description: 'Provide a valid 17–20 digit Discord server ID.',
        color: COLORS.warning,
      }));
      return;
    }
    const id = { serverId };

    const fields = await Promise.all([
      blacklistSection(stores, { scope: 'server', id }),
      watchlistSection(stores, { scope: 'server', id }),
      casesSection(stores, interaction.guildId, serverId),
    ]);

    const embed = brandedEmbed(interaction, {
      title: `${EMOJIS.announce} Unified lookup — server \`${serverId}\``,
      description: 'Cross-system results for this server ID.',
      color: COLORS.brand,
      fields,
    });
    await replyWithEmbed(interaction, embed);
  } else {
    const username = interaction.options.getString('username', true).trim();
    const roblox = await robloxSection(username);
    const embed = brandedEmbed(interaction, {
      title: `${EMOJIS.people} Unified lookup — Roblox \`${username}\``,
      description: 'Roblox account info. Discord cross-referencing requires a linked account (not yet configured).',
      color: COLORS.brand,
      fields: [roblox],
    });
    await replyWithEmbed(interaction, embed);
  }

  await auditLog(interaction.client, interaction.guildId, {
    action: 'LOOKUP',
    actorId: interaction.user.id,
    target: subcommand === 'user'
      ? `<@${interaction.options.getUser('user').id}>`
      : subcommand === 'server'
        ? `\`${interaction.options.getString('server_id')}\``
        : `Roblox: ${interaction.options.getString('username')}`,
    detail: `<@${interaction.user.id}> ran a unified lookup (${subcommand}).`,
    color: COLORS.brand,
  });
}

module.exports = { lookupCommand, handleLookupCommand };
