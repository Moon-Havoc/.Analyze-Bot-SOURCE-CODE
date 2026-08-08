const { AttachmentBuilder, SlashCommandBuilder } = require('discord.js');
const { COLORS, EMOJIS, NO_MENTIONS, brandedEmbed, noticeEmbed } = require('./brand');
const { auditLog } = require('./audit');
const { getTicketConfig, isSupportMember } = require('./ticket-suite');

const CASE_COLOR = 0x6366F1; // indigo — distinct from tickets/blacklists/watchlists
const TEXT_MAX_LENGTH = 1000;

const caseCommand = new SlashCommandBuilder()
  .setName('case')
  .setDescription('Manage structured investigation cases.')
  .addSubcommand((subcommand) => subcommand
    .setName('open')
    .setDescription('Open a new investigation case.')
    .addStringOption((option) => option
      .setName('subject')
      .setDescription('Short subject line')
      .setMaxLength(150)
      .setRequired(true))
    .addStringOption((option) => option
      .setName('details')
      .setDescription('Full description of the investigation')
      .setMaxLength(TEXT_MAX_LENGTH)
      .setRequired(true)))
  .addSubcommand((subcommand) => subcommand
    .setName('close')
    .setDescription('Close a case with a final verdict.')
    .addIntegerOption((option) => option
      .setName('case_number')
      .setDescription('Case number')
      .setMinValue(1)
      .setRequired(true))
    .addStringOption((option) => option
      .setName('verdict')
      .setDescription('Final verdict / outcome')
      .setMaxLength(TEXT_MAX_LENGTH)
      .setRequired(true)))
  .addSubcommand((subcommand) => subcommand
    .setName('note')
    .setDescription('Add an investigation note to a case.')
    .addIntegerOption((option) => option
      .setName('case_number')
      .setDescription('Case number')
      .setMinValue(1)
      .setRequired(true))
    .addStringOption((option) => option
      .setName('text')
      .setDescription('Note text')
      .setMaxLength(TEXT_MAX_LENGTH)
      .setRequired(true)))
  .addSubcommand((subcommand) => subcommand
    .setName('view')
    .setDescription("View a case's full details.")
    .addIntegerOption((option) => option
      .setName('case_number')
      .setDescription('Case number')
      .setMinValue(1)
      .setRequired(true)))
  .addSubcommand((subcommand) => subcommand
    .setName('list')
    .setDescription('List cases, optionally filtered by status.')
    .addStringOption((option) => option
      .setName('status')
      .setDescription('Filter by status')
      .addChoices(
        { name: 'open', value: 'open' },
        { name: 'closed', value: 'closed' },
      )
      .setRequired(false)))
  .addSubcommand((subcommand) => subcommand
    .setName('link')
    .setDescription('Link a subject (user or server) to a case.')
    .addIntegerOption((option) => option
      .setName('case_number')
      .setDescription('Case number')
      .setMinValue(1)
      .setRequired(true))
    .addStringOption((option) => option
      .setName('user_or_server_id')
      .setDescription('Discord user or server ID to link')
      .setMinLength(17)
      .setMaxLength(20)
      .setRequired(true)))
  .addSubcommand((subcommand) => subcommand
    .setName('report')
    .setDescription('Generate a downloadable case report with the full evidence trail.')
    .addIntegerOption((option) => option
      .setName('case_number')
      .setDescription('Case number')
      .setMinValue(1)
      .setRequired(true)));

/**
 * Posts a non-ephemeral case update to the configured case-results channel,
 * so the Investigation Team can see activity without needing to run /case
 * themselves. Visibility is controlled entirely by that channel's Discord
 * permissions, not by the bot — silently no-ops if unset or inaccessible,
 * same resilient pattern as auditLog().
 */
async function postCaseUpdate(interaction, embed) {
  const channelId = process.env.CASE_RESULTS_CHANNEL_ID;
  if (!channelId || !interaction.guild) return;
  const channel = await interaction.guild.channels.fetch(channelId).catch(() => null);
  if (!channel?.isTextBased()) return;
  await channel.send({ embeds: [embed], allowedMentions: NO_MENTIONS }).catch(() => null);
}

function quote(value) {
  return `> ${value.replace(/\n/g, '\n> ')}`;
}

function statusLabel(record) {
  return record.status === 'open' ? 'Open' : 'Closed';
}

function caseSummaryLine(record) {
  return `**#${record.number}** • ${statusLabel(record)} • ${record.subject}`;
}

function caseEmbed(interaction, record, { title, description, color = CASE_COLOR } = {}) {
  const openedAt = Math.floor(Date.parse(record.openedAt) / 1000);
  const fields = [
    { name: `${EMOJIS.database} SUBJECT`, value: record.subject, inline: true },
    { name: `${EMOJIS.online} STATUS`, value: statusLabel(record), inline: true },
    { name: `${EMOJIS.people} OPENED BY`, value: `<@${record.openedBy}>`, inline: true },
    { name: `${EMOJIS.ticket} CASE DETAILS`, value: quote(record.details) },
    { name: `${EMOJIS.database} OPENED`, value: `<t:${openedAt}:F>\n<t:${openedAt}:R>`, inline: true },
  ];

  if (record.status === 'closed') {
    const closedAt = Math.floor(Date.parse(record.closedAt) / 1000);
    fields.push(
      { name: `${EMOJIS.people} CLOSED BY`, value: `<@${record.closedBy}>`, inline: true },
      { name: `${EMOJIS.database} CLOSED`, value: `<t:${closedAt}:F>\n<t:${closedAt}:R>`, inline: true },
      { name: `${EMOJIS.check} VERDICT`, value: quote(record.verdict) },
    );
  }

  if (record.linkedIds.length) {
    fields.push({
      name: `${EMOJIS.people} LINKED SUBJECTS (${record.linkedIds.length})`,
      value: record.linkedIds.map((id) => `\`${id}\``).join('\n'),
    });
  }

  if (record.notes.length) {
    fields.push({
      name: `${EMOJIS.question} NOTES (${record.notes.length})`,
      value: record.notes
        .slice(-5)
        .map((note) => `${quote(note.text)}\n— <@${note.authorId}>`)
        .join('\n'),
    });
  }

  return brandedEmbed(interaction, {
    title: title ?? `${EMOJIS.database} Case #${record.number}`,
    description: description ?? record.subject,
    color,
    fields,
  });
}

function formatTimestamp(isoString) {
  if (!isoString) return 'N/A';
  return new Date(isoString).toISOString().replace('T', ' ').replace('Z', ' UTC');
}

function generateCaseReport(record, guildName) {
  const lines = [];
  lines.push('='.repeat(60));
  lines.push(`.ANALYZE INVESTIGATION CASE REPORT — CASE #${record.number}`);
  lines.push('='.repeat(60));
  lines.push('');
  lines.push(`Server:        ${guildName}`);
  lines.push(`Status:        ${statusLabel(record).toUpperCase()}`);
  lines.push(`Subject:       ${record.subject}`);
  lines.push(`Opened by:     ${record.openedBy} (Discord ID)`);
  lines.push(`Opened at:     ${formatTimestamp(record.openedAt)}`);
  if (record.status === 'closed') {
    lines.push(`Closed by:     ${record.closedBy} (Discord ID)`);
    lines.push(`Closed at:     ${formatTimestamp(record.closedAt)}`);
  }
  lines.push('');
  lines.push('-'.repeat(60));
  lines.push('CASE DETAILS');
  lines.push('-'.repeat(60));
  lines.push(record.details);
  lines.push('');

  if (record.status === 'closed') {
    lines.push('-'.repeat(60));
    lines.push('VERDICT');
    lines.push('-'.repeat(60));
    lines.push(record.verdict);
    lines.push('');
  }

  lines.push('-'.repeat(60));
  lines.push(`LINKED SUBJECTS (${record.linkedIds.length})`);
  lines.push('-'.repeat(60));
  lines.push(record.linkedIds.length
    ? record.linkedIds.map((id) => `  • ${id}`).join('\n')
    : '  None linked.');
  lines.push('');

  lines.push('-'.repeat(60));
  lines.push(`EVIDENCE / STAFF NOTES (${record.notes.length})`);
  lines.push('-'.repeat(60));
  if (record.notes.length) {
    record.notes.forEach((note, index) => {
      lines.push(`[${index + 1}] ${formatTimestamp(note.addedAt)} — Author: ${note.authorId} (Discord ID)`);
      lines.push(note.text);
      lines.push('');
    });
  } else {
    lines.push('  No notes have been added to this case.');
    lines.push('');
  }

  lines.push('='.repeat(60));
  lines.push(`Generated ${formatTimestamp(new Date().toISOString())} • .analyze Investigation Network`);
  lines.push('='.repeat(60));

  return lines.join('\n');
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
  return noticeEmbed(interaction, { title: 'Action unavailable', description, color: COLORS.warning });
}

async function replyWithEmbed(interaction, embed, extra = {}) {
  await interaction.reply({ embeds: [embed], ephemeral: true, allowedMentions: NO_MENTIONS, ...extra });
}

async function editWithEmbed(interaction, embed) {
  await interaction.editReply({ embeds: [embed], allowedMentions: NO_MENTIONS });
}

async function requireStaff(interaction, config) {
  if (isSupportMember(interaction, config)) return true;
  await replyWithEmbed(interaction, noticeEmbed(interaction, {
    title: 'Support access required',
    description: 'Only authorized support staff can manage or view investigation cases.',
    color: COLORS.warning,
  }));
  return false;
}

async function handleCaseCommand(interaction, store, config = getTicketConfig()) {
  if (!interaction.inGuild()) {
    await replyWithEmbed(interaction, noticeEmbed(interaction, {
      title: 'Server-only command',
      description: 'Investigation cases are managed from within a Discord server.',
      color: COLORS.warning,
    }));
    return;
  }

  if (!await requireStaff(interaction, config)) return;

  const subcommand = interaction.options.getSubcommand();

  if (subcommand === 'open') {
    const subject = interaction.options.getString('subject', true);
    const details = interaction.options.getString('details', true);
    await interaction.deferReply({ ephemeral: true });

    const record = await store.createCase({
      guildId: interaction.guildId,
      subject,
      details,
      openedBy: interaction.user.id,
    });

    const embed = caseEmbed(interaction, record, {
      title: `${EMOJIS.check} Case #${record.number} opened`,
      description: 'A new investigation case has been created.',
    });
    await auditLog(interaction.client, interaction.guildId, {
      action: 'CASE_OPEN',
      actorId: interaction.user.id,
      target: `Case #${record.number}`,
      detail: `A new investigation case has been opened: **${subject}**.`,
      color: CASE_COLOR,
    });
    await postCaseUpdate(interaction, embed);
    await editWithEmbed(interaction, embed);
    return;
  }

  if (subcommand === 'close') {
    const caseNumber = interaction.options.getInteger('case_number', true);
    const verdict = interaction.options.getString('verdict', true);
    await interaction.deferReply({ ephemeral: true });

    const existing = await store.getCase(interaction.guildId, caseNumber);
    if (!existing) {
      await editWithEmbed(interaction, errorEmbed(interaction, `Case #${caseNumber} was not found in this server.`));
      return;
    }
    if (existing.status === 'closed') {
      await editWithEmbed(interaction, noticeEmbed(interaction, {
        title: 'Case already closed',
        description: `Case #${caseNumber} has already been closed.`,
        color: COLORS.neutral,
      }));
      return;
    }

    const record = await store.closeCase(interaction.guildId, caseNumber, {
      closedBy: interaction.user.id,
      verdict,
    });
    const embed = caseEmbed(interaction, record, {
      title: `${EMOJIS.check} Case #${record.number} closed`,
      description: 'This investigation case has been closed.',
      color: COLORS.success,
    });
    await auditLog(interaction.client, interaction.guildId, {
      action: 'CASE_CLOSE',
      actorId: interaction.user.id,
      target: `Case #${record.number}`,
      detail: `Investigation case #${record.number} has been closed.`,
      color: COLORS.success,
      fields: [{ name: `${EMOJIS.check} VERDICT`, value: quote(verdict) }],
    });
    await postCaseUpdate(interaction, embed);
    await editWithEmbed(interaction, embed);
    return;
  }

  if (subcommand === 'note') {
    const caseNumber = interaction.options.getInteger('case_number', true);
    const text = interaction.options.getString('text', true);
    await interaction.deferReply({ ephemeral: true });

    const record = await store.addNote(interaction.guildId, caseNumber, {
      authorId: interaction.user.id,
      text,
    });
    if (!record) {
      await editWithEmbed(interaction, errorEmbed(interaction, `Case #${caseNumber} was not found in this server.`));
      return;
    }

    await auditLog(interaction.client, interaction.guildId, {
      action: 'CASE_NOTE',
      actorId: interaction.user.id,
      target: `Case #${record.number}`,
      detail: `A note has been added to investigation case #${record.number}.`,
      color: CASE_COLOR,
      fields: [{ name: `${EMOJIS.question} NOTE`, value: quote(text) }],
    });
    await postCaseUpdate(interaction, caseEmbed(interaction, record, {
      title: `${EMOJIS.question} Case #${record.number} — note added`,
      description: `<@${interaction.user.id}> added a note to this case.`,
    }));
    await editWithEmbed(interaction, successEmbed(interaction, {
      title: 'Note added',
      description: `Your note has been added to case #${record.number}.`,
    }));
    return;
  }

  if (subcommand === 'view') {
    const caseNumber = interaction.options.getInteger('case_number', true);
    await interaction.deferReply({ ephemeral: true });

    const record = await store.getCase(interaction.guildId, caseNumber);
    if (!record) {
      await editWithEmbed(interaction, errorEmbed(interaction, `Case #${caseNumber} was not found in this server.`));
      return;
    }
    await editWithEmbed(interaction, caseEmbed(interaction, record));
    return;
  }

  if (subcommand === 'list') {
    const status = interaction.options.getString('status');
    await interaction.deferReply({ ephemeral: true });

    const cases = await store.listCases(interaction.guildId, status);
    if (!cases.length) {
      await editWithEmbed(interaction, noticeEmbed(interaction, {
        title: 'No cases found',
        description: status ? `No ${status} cases were found in this server.` : 'No cases have been opened in this server yet.',
        color: COLORS.neutral,
      }));
      return;
    }

    const embed = brandedEmbed(interaction, {
      title: `${EMOJIS.database} Investigation cases${status ? ` — ${status}` : ''}`,
      description: cases.slice(0, 25).map(caseSummaryLine).join('\n'),
      color: CASE_COLOR,
      fields: cases.length > 25
        ? [{ name: `${EMOJIS.question} NOTE`, value: `Showing the first 25 of ${cases.length} cases.` }]
        : [],
    });
    await editWithEmbed(interaction, embed);
    return;
  }

  if (subcommand === 'report') {
    const caseNumber = interaction.options.getInteger('case_number', true);
    await interaction.deferReply({ ephemeral: true });

    const record = await store.getCase(interaction.guildId, caseNumber);
    if (!record) {
      await editWithEmbed(interaction, errorEmbed(interaction, `Case #${caseNumber} was not found in this server.`));
      return;
    }

    const reportText = generateCaseReport(record, interaction.guild.name);
    const reportFile = new AttachmentBuilder(Buffer.from(reportText, 'utf8'), {
      name: `case-${record.number}-report.txt`,
    });

    await auditLog(interaction.client, interaction.guildId, {
      action: 'CASE_REPORT',
      actorId: interaction.user.id,
      target: `Case #${record.number}`,
      detail: `<@${interaction.user.id}> generated a downloadable report for investigation case #${record.number}.`,
      color: CASE_COLOR,
    });

    await interaction.editReply({
      embeds: [successEmbed(interaction, {
        title: `Case #${record.number} report ready`,
        description: `Includes ${record.notes.length} note(s) and ${record.linkedIds.length} linked subject(s). Download the attachment below.`,
      })],
      files: [reportFile],
      allowedMentions: NO_MENTIONS,
    });
    return;
  }

  // link
  const caseNumber = interaction.options.getInteger('case_number', true);
  const linkedId = interaction.options.getString('user_or_server_id', true);
  if (!/^\d{17,20}$/.test(linkedId)) {
    await replyWithEmbed(interaction, errorEmbed(interaction, 'Provide a valid 17–20 digit Discord user or server ID.'));
    return;
  }
  await interaction.deferReply({ ephemeral: true });

  const record = await store.linkId(interaction.guildId, caseNumber, linkedId);
  if (!record) {
    await editWithEmbed(interaction, errorEmbed(interaction, `Case #${caseNumber} was not found in this server.`));
    return;
  }

  await auditLog(interaction.client, interaction.guildId, {
    action: 'CASE_NOTE',
    actorId: interaction.user.id,
    target: `Case #${record.number}`,
    detail: `\`${linkedId}\` has been linked to investigation case #${record.number}.`,
    color: CASE_COLOR,
  });
  await postCaseUpdate(interaction, caseEmbed(interaction, record, {
    title: `${EMOJIS.people} Case #${record.number} — subject linked`,
    description: `<@${interaction.user.id}> linked \`${linkedId}\` to this case.`,
  }));
  await editWithEmbed(interaction, successEmbed(interaction, {
    title: 'Subject linked',
    description: `\`${linkedId}\` is now linked to case #${record.number}.`,
  }));
}

module.exports = { caseCommand, errorEmbed, handleCaseCommand, CASE_COLOR };
