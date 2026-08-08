const {
  ActionRowBuilder,
  AttachmentBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  ModalBuilder,
  PermissionFlagsBits,
  SlashCommandBuilder,
  TextInputBuilder,
  TextInputStyle,
} = require('discord.js');
const {
  COLORS,
  EMOJIS,
  EMOJI_IDS,
  NO_MENTIONS,
  brandedEmbed,
  noticeEmbed,
} = require('./brand');
const { auditLog } = require('./audit');

const DEFAULT_TICKET_CATEGORY_ID = '1525899635791626311';
const DEFAULT_SUPPORT_CHANNEL_ID = '1522762014357983252';
const creationLocks = new Set();

const ticketCommand = new SlashCommandBuilder()
  .setName('ticket')
  .setDescription('Manage .analyze support tickets.')
  .addSubcommand((subcommand) => subcommand
    .setName('panel')
    .setDescription('Post or refresh the support ticket panel.')
    .addChannelOption((option) => option
      .setName('channel')
      .setDescription('Channel where the support panel is posted (default: current config)')
      .addChannelTypes(ChannelType.GuildText)
      .setRequired(false))
    .addChannelOption((option) => option
      .setName('category')
      .setDescription('Category where new ticket channels are created (default: current config)')
      .addChannelTypes(ChannelType.GuildCategory)
      .setRequired(false)))
  .addSubcommand((subcommand) => subcommand
    .setName('add')
    .setDescription('Give a member access to this ticket.')
    .addUserOption((option) => option
      .setName('user')
      .setDescription('Member to add')
      .setRequired(true)))
  .addSubcommand((subcommand) => subcommand
    .setName('remove')
    .setDescription('Remove a member from this ticket.')
    .addUserOption((option) => option
      .setName('user')
      .setDescription('Member to remove')
      .setRequired(true)))
  .addSubcommand((subcommand) => subcommand
    .setName('close')
    .setDescription('Close this ticket.'))
  .addSubcommand((subcommand) => subcommand
    .setName('transcript')
    .setDescription('Download a transcript of this ticket.'))
  .addSubcommand((subcommand) => subcommand
    .setName('cleanup')
    .setDescription('Delete the archived channels of old closed tickets in this server.')
    .addIntegerOption((option) => option
      .setName('older_than_days')
      .setDescription('Delete closed tickets archived longer than this many days (default: 7)')
      .setMinValue(0)
      .setRequired(false)));

function getTicketConfig(environment = process.env, panelOverrides = {}) {
  return {
    categoryId: panelOverrides.categoryId || environment.TICKET_CATEGORY_ID || DEFAULT_TICKET_CATEGORY_ID,
    supportChannelId: panelOverrides.supportChannelId || environment.SUPPORT_CHANNEL_ID || DEFAULT_SUPPORT_CHANNEL_ID,
    supportRoleId: environment.SUPPORT_ROLE_ID || null,
  };
}

function quote(value) {
  return `> ${value.replace(/\n/g, '\n> ')}`;
}

function memberPermissions() {
  return [
    PermissionFlagsBits.ViewChannel,
    PermissionFlagsBits.SendMessages,
    PermissionFlagsBits.ReadMessageHistory,
    PermissionFlagsBits.AttachFiles,
    PermissionFlagsBits.EmbedLinks,
  ];
}

function button(customId, label, style, emojiId, disabled = false) {
  return new ButtonBuilder()
    .setCustomId(customId)
    .setLabel(label)
    .setStyle(style)
    .setEmoji({ id: emojiId })
    .setDisabled(disabled);
}

function panelPayload(client) {
  const embed = brandedEmbed({ client }, {
    title: `${EMOJIS.ticket} Support Centre`,
    description: 'Need help with an investigation, report, or community concern? Open a private ticket and the .analyze team will review it with you.',
    color: COLORS.brand,
    fields: [
      {
        name: `${EMOJIS.ticket} HOW IT WORKS`,
        value: '1. Press **Open a ticket**\n2. Add a clear subject and details\n3. A staff member will claim your case',
      },
      {
        name: `${EMOJIS.announce} WHAT TO INCLUDE`,
        value: 'Relevant usernames, server IDs, dates, evidence links, and a concise explanation of what happened.',
      },
      {
        name: `${EMOJIS.online} PRIVATE BY DEFAULT`,
        value: 'Only you, authorized support staff, and members explicitly added to the ticket can view it.',
      },
    ],
  });

  return {
    embeds: [embed],
    components: [new ActionRowBuilder().addComponents(
      button('ticket:create', 'Open a ticket', ButtonStyle.Primary, EMOJI_IDS.ticket),
    )],
    allowedMentions: NO_MENTIONS,
  };
}

function openTicketControls() {
  return new ActionRowBuilder().addComponents(
    button('ticket:claim', 'Claim', ButtonStyle.Secondary, EMOJI_IDS.people),
    button('ticket:transcript', 'Transcript', ButtonStyle.Secondary, EMOJI_IDS.database),
    button('ticket:close', 'Close ticket', ButtonStyle.Danger, EMOJI_IDS.ticket),
  );
}

function closedTicketControls() {
  return new ActionRowBuilder().addComponents(
    button('ticket:reopen', 'Reopen ticket', ButtonStyle.Success, EMOJI_IDS.check),
    button('ticket:transcript', 'Transcript', ButtonStyle.Secondary, EMOJI_IDS.database),
    button('ticket:delete', 'Delete channel', ButtonStyle.Danger, EMOJI_IDS.ticket),
  );
}

function archivedChannelName(name) {
  return `closed-${name}`.slice(0, 100);
}

/**
 * Locks or unlocks send access for the ticket requester and any added
 * participants. Support staff and the bot always keep their access, since
 * their overwrites are not touched here.
 */
async function setParticipantsSendAccess(channel, ticket, canSend) {
  const targets = [ticket.ownerId, ...ticket.participants];
  await Promise.all(targets.map((id) => (
    channel.permissionOverwrites.edit(id, { SendMessages: canSend }).catch(() => null)
  )));
}



function ticketEmbed(source, ticket, owner, { event, description, color = COLORS.brand }) {
  const claimedBy = ticket.claimedBy ? `<@${ticket.claimedBy}>` : 'Awaiting assignment';
  return brandedEmbed(source, {
    title: `${EMOJIS.ticket} Ticket #${ticket.number} • ${event}`,
    description,
    color,
    fields: [
      { name: `${EMOJIS.people} REQUESTER`, value: `<@${ticket.ownerId}>\n\`${owner?.username ?? ticket.ownerId}\``, inline: true },
      { name: `${EMOJIS.database} SUBJECT`, value: ticket.subject, inline: true },
      { name: `${EMOJIS.online} STATUS`, value: ticket.status === 'open' ? 'Open' : 'Closed', inline: true },
      { name: `${EMOJIS.people} ASSIGNED TO`, value: claimedBy, inline: true },
      { name: `${EMOJIS.ticket} REQUEST DETAILS`, value: quote(ticket.details) },
    ],
  });
}

function successEmbed(source, title, description, fields = []) {
  return brandedEmbed(source, {
    title: `${EMOJIS.check} ${title}`,
    description,
    color: COLORS.success,
    fields,
  });
}

function errorEmbed(source, title, description) {
  return noticeEmbed(source, { title, description, color: COLORS.warning });
}

function privateResponse(embed, extra = {}) {
  return { embeds: [embed], ephemeral: true, allowedMentions: NO_MENTIONS, ...extra };
}

async function respond(interaction, embed, extra = {}) {
  const response = privateResponse(embed, extra);
  if (interaction.deferred || interaction.replied) return interaction.editReply(response);
  return interaction.reply(response);
}

function isSupportMember(interaction, config) {
  if (!interaction.inGuild()) return false;
  const permissions = interaction.memberPermissions;
  if (permissions?.has(PermissionFlagsBits.Administrator)
    || permissions?.has(PermissionFlagsBits.ManageGuild)
    || permissions?.has(PermissionFlagsBits.ManageChannels)) return true;
  return Boolean(config.supportRoleId && interaction.member?.roles?.cache?.has(config.supportRoleId));
}

function canControlTicket(interaction, ticket, config) {
  return interaction.user.id === ticket.ownerId || isSupportMember(interaction, config);
}

async function requireSupportMember(interaction, config) {
  if (isSupportMember(interaction, config)) return true;
  await respond(interaction, errorEmbed(interaction, 'Support access required', 'Only authorized support staff can perform this action.'));
  return false;
}

async function getCurrentTicket(interaction, store) {
  if (!interaction.inGuild()) {
    await respond(interaction, errorEmbed(interaction, 'Server-only action', 'Ticket controls can only be used inside a support ticket.'));
    return null;
  }
  const ticket = await store.getTicket(interaction.channelId);
  if (!ticket) {
    await respond(interaction, errorEmbed(interaction, 'Ticket not found', 'This channel is not managed by the .analyze ticket suite.'));
    return null;
  }
  return ticket;
}

async function ensureTicketPanel(client, store, config = getTicketConfig(), panelUpdates = {}) {
  const channel = await client.channels.fetch(config.supportChannelId).catch(() => null);
  if (!channel?.isTextBased() || !channel.guild) {
    throw new Error(`SUPPORT_CHANNEL_ID ${config.supportChannelId} is not an accessible text channel.`);
  }

  const existing = await store.getPanel(channel.guild.id);
  const payload = panelPayload(client);

  // Persist any user-chosen overrides (category, channel) in the panel record.
  const panelRecord = {
    channelId: channel.id,
    ...(existing || {}),
    ...panelUpdates,
  };

  if (existing?.channelId === channel.id) {
    // force: true bypasses discord.js's message cache — without it, a manually
    // deleted message can still resolve here from cache, then fail on .edit()
    // with an uncaught "Unknown Message" instead of falling through below.
    const message = await channel.messages.fetch({ message: existing.messageId, force: true }).catch(() => null);
    if (message) {
      const edited = await message.edit(payload).catch(() => null);
      if (edited) {
        await store.setPanel(channel.guild.id, { ...panelRecord, messageId: edited.id });
        return { created: false, channel, message: edited };
      }
      // Message existed a moment ago but the edit still failed (e.g. deleted in
      // the gap between fetch and edit) — fall through and post a fresh one.
    }
  }

  const message = await channel.send(payload);
  await store.setPanel(channel.guild.id, { ...panelRecord, messageId: message.id });
  return { created: true, channel, message };
}

function showCreateModal(interaction) {
  const modal = new ModalBuilder()
    .setCustomId('ticket:create-modal')
    .setTitle('Open a support ticket')
    .addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('subject')
          .setLabel('What do you need help with?')
          .setStyle(TextInputStyle.Short)
          .setMinLength(3)
          .setMaxLength(100)
          .setRequired(true),
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('details')
          .setLabel('Describe the situation')
          .setStyle(TextInputStyle.Paragraph)
          .setMinLength(10)
          .setMaxLength(1000)
          .setPlaceholder('Include usernames, server IDs, dates, and any evidence links.')
          .setRequired(true),
      ),
    );
  return interaction.showModal(modal);
}

function channelName(number, subject) {
  const slug = subject
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60) || 'support';
  return `ticket-${number}-${slug}`.slice(0, 100);
}

function ticketOverwrites(guild, userId, botId, config) {
  const permissions = memberPermissions();
  const overwrites = [
    { id: guild.roles.everyone.id, deny: [PermissionFlagsBits.ViewChannel] },
    { id: userId, allow: permissions },
    {
      id: botId,
      allow: [...permissions, PermissionFlagsBits.ManageChannels, PermissionFlagsBits.ManageMessages],
    },
  ];
  if (config.supportRoleId) {
    overwrites.push({
      id: config.supportRoleId,
      allow: [...permissions, PermissionFlagsBits.ManageMessages],
    });
  }
  return overwrites;
}

async function createTicketFromModal(interaction, store, config) {
  if (!interaction.inGuild()) {
    await respond(interaction, errorEmbed(interaction, 'Server-only action', 'Support tickets must be opened from the .analyze support server.'));
    return;
  }

  const lockKey = `${interaction.guildId}:${interaction.user.id}`;
  if (creationLocks.has(lockKey)) {
    await respond(interaction, noticeEmbed(interaction, {
      title: 'Ticket creation in progress',
      description: 'Your support ticket is already being prepared. Please wait a moment.',
      color: COLORS.neutral,
    }));
    return;
  }

  creationLocks.add(lockKey);
  try {
    const existing = await store.findOpenTicketByOwner(interaction.guildId, interaction.user.id);
    if (existing) {
      await respond(interaction, noticeEmbed(interaction, {
        title: 'Open ticket already found',
        description: `You already have an open ticket: <#${existing.channelId}>. Please continue there before opening another one.`,
        color: COLORS.neutral,
      }));
      return;
    }

    const category = await interaction.guild.channels.fetch(config.categoryId).catch(() => null);
    if (!category || category.type !== ChannelType.GuildCategory || category.guildId !== interaction.guildId) {
      await respond(interaction, errorEmbed(interaction, 'Ticket category unavailable', 'The configured ticket category is missing or belongs to another server. Please contact an administrator.'));
      return;
    }

    await interaction.deferReply({ ephemeral: true });
    const subject = interaction.fields.getTextInputValue('subject').trim();
    const details = interaction.fields.getTextInputValue('details').trim();
    const number = await store.allocateTicketNumber();
    const name = channelName(number, subject);
    const channel = await interaction.guild.channels.create({
      name,
      type: ChannelType.GuildText,
      parent: category.id,
      topic: `Ticket #${number} • Owner: ${interaction.user.id} • Status: open`,
      permissionOverwrites: ticketOverwrites(interaction.guild, interaction.user.id, interaction.client.user.id, config),
      reason: `Opened support ticket #${number} for ${interaction.user.tag}`,
    });

    const result = await store.createTicket({
      channelId: channel.id,
      guildId: interaction.guildId,
      ownerId: interaction.user.id,
      number,
      subject,
      details,
      channelName: name,
    });
    if (!result.created) {
      await channel.delete('Duplicate ticket prevented').catch(() => null);
      await respond(interaction, noticeEmbed(interaction, {
        title: 'Open ticket already found',
        description: `You already have an open ticket: <#${result.ticket.channelId}>.`,
        color: COLORS.neutral,
      }));
      return;
    }

    const welcome = ticketEmbed(interaction, result.ticket, interaction.user, {
      event: 'Opened',
      description: 'Your private support channel is ready. A staff member will claim your ticket shortly.',
      color: COLORS.brand,
    });
    await channel.send({ embeds: [welcome], components: [openTicketControls()], allowedMentions: NO_MENTIONS });
    await auditLog(interaction.client, interaction.guildId, {
      action: 'TICKET_OPEN',
      actorId: interaction.user.id,
      target: `Ticket #${number}`,
      detail: `A new support ticket has been opened: <#${channel.id}>.`,
      color: COLORS.brand,
      fields: [
        { name: `${EMOJIS.database} SUBJECT`, value: subject, inline: true },
      ],
    });
    await respond(interaction, successEmbed(interaction, 'Ticket created', `Your private support ticket is ready: <#${channel.id}>.`, [
      { name: `${EMOJIS.ticket} TICKET NUMBER`, value: `#${number}`, inline: true },
      { name: `${EMOJIS.online} STATUS`, value: 'Open', inline: true },
    ]));
  } finally {
    creationLocks.delete(lockKey);
  }
}

async function requestClose(interaction, store, config) {
  const ticket = await getCurrentTicket(interaction, store);
  if (!ticket) return;
  if (!canControlTicket(interaction, ticket, config)) {
    await respond(interaction, errorEmbed(interaction, 'Ticket access required', 'Only the ticket opener or authorized support staff can close this ticket.'));
    return;
  }
  if (ticket.status === 'closed') {
    await respond(interaction, noticeEmbed(interaction, {
      title: 'Ticket already closed',
      description: 'This ticket has already been closed.',
      color: COLORS.neutral,
    }));
    return;
  }

  const confirmation = brandedEmbed(interaction, {
    title: `${EMOJIS.question} Close ticket #${ticket.number}?`,
    description: 'Closing this ticket will lock it for the requester, post a transcript to the audit log, and archive the channel as read-only. Staff can reopen it later, or delete it permanently once it is no longer needed.',
    color: COLORS.warning,
  });
  await respond(interaction, confirmation, {
    components: [new ActionRowBuilder().addComponents(
      button('ticket:close-confirm', 'Confirm close', ButtonStyle.Danger, EMOJI_IDS.ticket),
      button('ticket:close-cancel', 'Keep ticket open', ButtonStyle.Secondary, EMOJI_IDS.check),
    )],
  });
}

async function closeTicket(interaction, store, config) {
  const ticket = await getCurrentTicket(interaction, store);
  if (!ticket) return;
  if (!canControlTicket(interaction, ticket, config)) {
    await respond(interaction, errorEmbed(interaction, 'Ticket access required', 'Only the ticket opener or authorized support staff can close this ticket.'));
    return;
  }
  if (ticket.status === 'closed') {
    await respond(interaction, noticeEmbed(interaction, {
      title: 'Ticket already closed',
      description: 'This ticket has already been closed.',
      color: COLORS.neutral,
    }));
    return;
  }

  await interaction.deferReply({ ephemeral: true });

  // 1. Generate a transcript of the conversation so far.
  const transcript = await createTranscript(interaction.channel, ticket);
  const transcriptFile = new AttachmentBuilder(Buffer.from(transcript, 'utf8'), {
    name: `analyze-ticket-${ticket.number}-transcript.txt`,
  });

  // 2. Mark the ticket as closed in the store.
  const closedTicket = await store.closeTicket(interaction.channelId, interaction.user.id);
  if (!closedTicket) {
    await respond(interaction, errorEmbed(interaction, 'Unable to close ticket', 'The ticket could not be updated. Please try again.'));
    return;
  }

  // 3. Lock the channel for the requester and participants, and mark it archived by name.
  // Support staff keep full access so they can review or reopen it later.
  await setParticipantsSendAccess(interaction.channel, closedTicket, false);
  await interaction.channel.setName(
    archivedChannelName(closedTicket.channelName),
    `Ticket #${closedTicket.number} archived`,
  ).catch(() => null);

  // 4. Send the audit log with the transcript attached.
  const owner = await interaction.client.users.fetch(closedTicket.ownerId).catch(() => null);
  const claimedBy = closedTicket.claimedBy ? `<@${closedTicket.claimedBy}>` : 'Unassigned';
  await auditLog(interaction.client, interaction.guildId, {
    action: 'TICKET_CLOSE',
    actorId: interaction.user.id,
    target: `Ticket #${closedTicket.number}`,
    detail: 'A support ticket has been closed and archived as read-only. The transcript so far is attached.',
    color: COLORS.warning,
    fields: [
      { name: `${EMOJIS.people} REQUESTER`, value: `<@${closedTicket.ownerId}>\n\`${owner?.username ?? closedTicket.ownerId}\``, inline: true },
      { name: `${EMOJIS.database} SUBJECT`, value: closedTicket.subject, inline: true },
      { name: `${EMOJIS.people} ASSIGNED TO`, value: claimedBy, inline: true },
      { name: `${EMOJIS.ticket} REQUEST DETAILS`, value: quote(closedTicket.details) },
    ],
    files: [transcriptFile],
  });

  // 5. Try to DM the ticket owner a closure notice.
  if (owner) {
    const dmEmbed = brandedEmbed(interaction, {
      title: `${EMOJIS.ticket} Ticket #${closedTicket.number} • Closed`,
      description: `Your support ticket **"${closedTicket.subject}"** has been closed by <@${interaction.user.id}>. The channel is now archived and read-only; if you need further help, open a new ticket from the support panel.`,
      color: COLORS.warning,
    });
    await owner.send({ embeds: [dmEmbed], allowedMentions: NO_MENTIONS }).catch(() => null);
  }

  // 6. Post the archive notice with reopen/delete controls in the channel itself.
  await interaction.channel.send({
    embeds: [ticketEmbed(interaction, closedTicket, owner, {
      event: 'Closed',
      description: `This ticket has been closed and archived by <@${interaction.user.id}>. It is now read-only for the requester. Staff can reopen it or delete the channel permanently.`,
      color: COLORS.warning,
    })],
    components: [closedTicketControls()],
    allowedMentions: NO_MENTIONS,
  });

  await respond(interaction, successEmbed(interaction, 'Ticket closed', `Ticket #${closedTicket.number} has been archived.`));
}

async function reopenTicket(interaction, store, config) {
  const ticket = await getCurrentTicket(interaction, store);
  if (!ticket) return;
  if (!canControlTicket(interaction, ticket, config)) {
    await respond(interaction, errorEmbed(interaction, 'Ticket access required', 'Only the ticket opener or authorized support staff can reopen this ticket.'));
    return;
  }
  if (ticket.status === 'open') {
    await respond(interaction, noticeEmbed(interaction, {
      title: 'Ticket already open',
      description: 'This ticket is already open.',
      color: COLORS.neutral,
    }));
    return;
  }

  await interaction.deferReply({ ephemeral: true });
  const reopenedTicket = await store.reopenTicket(interaction.channelId);
  if (!reopenedTicket) {
    await respond(interaction, errorEmbed(interaction, 'Unable to reopen ticket', 'The ticket could not be updated. Please try again.'));
    return;
  }

  await setParticipantsSendAccess(interaction.channel, reopenedTicket, true);
  await interaction.channel.setName(
    reopenedTicket.channelName,
    `Ticket #${reopenedTicket.number} reopened`,
  ).catch(() => null);

  const owner = await interaction.client.users.fetch(reopenedTicket.ownerId).catch(() => null);
  await auditLog(interaction.client, interaction.guildId, {
    action: 'TICKET_REOPEN',
    actorId: interaction.user.id,
    target: `Ticket #${reopenedTicket.number}`,
    detail: `<@${interaction.user.id}> reopened this support ticket.`,
    color: COLORS.brand,
  });

  await interaction.channel.send({
    embeds: [ticketEmbed(interaction, reopenedTicket, owner, {
      event: 'Reopened',
      description: `<@${interaction.user.id}> reopened this ticket. It is active again.`,
      color: COLORS.brand,
    })],
    components: [openTicketControls()],
    allowedMentions: NO_MENTIONS,
  });

  await respond(interaction, successEmbed(interaction, 'Ticket reopened', `Ticket #${reopenedTicket.number} is now open again.`));
}

async function deleteArchivedTicket(interaction, store, config) {
  const ticket = await getCurrentTicket(interaction, store);
  if (!ticket) return;
  if (!await requireSupportMember(interaction, config)) return;
  if (ticket.status !== 'closed') {
    await respond(interaction, noticeEmbed(interaction, {
      title: 'Ticket is still open',
      description: 'Close this ticket before permanently deleting its channel.',
      color: COLORS.neutral,
    }));
    return;
  }

  await interaction.deferReply({ ephemeral: true });
  await auditLog(interaction.client, interaction.guildId, {
    action: 'TICKET_DELETE',
    actorId: interaction.user.id,
    target: `Ticket #${ticket.number}`,
    detail: `<@${interaction.user.id}> permanently deleted the archived channel for this ticket.`,
    color: COLORS.danger,
  });
  await interaction.channel.delete(`Ticket #${ticket.number} permanently deleted by ${interaction.user.tag}`).catch(() => null);
}

async function claimTicket(interaction, store, config) {
  const ticket = await getCurrentTicket(interaction, store);
  if (!ticket) return;
  if (!await requireSupportMember(interaction, config)) return;
  if (ticket.status !== 'open') {
    await respond(interaction, noticeEmbed(interaction, {
      title: 'Ticket is closed',
      description: 'Reopen this ticket before claiming it.',
      color: COLORS.neutral,
    }));
    return;
  }

  await interaction.deferReply({ ephemeral: true });
  const claimedTicket = await store.claimTicket(interaction.channelId, interaction.user.id);
  const owner = await interaction.client.users.fetch(claimedTicket.ownerId).catch(() => null);
  await interaction.channel.send({
    embeds: [ticketEmbed(interaction, claimedTicket, owner, {
      event: 'Claimed',
      description: `<@${interaction.user.id}> is now handling this support ticket.`,
      color: COLORS.success,
    })],
    components: [openTicketControls()],
    allowedMentions: NO_MENTIONS,
  });
  await auditLog(interaction.client, interaction.guildId, {
    action: 'TICKET_CLAIM',
    actorId: interaction.user.id,
    target: `Ticket #${claimedTicket.number}`,
    detail: `<@${interaction.user.id}> claimed this support ticket.`,
    color: COLORS.success,
  });
  await respond(interaction, successEmbed(interaction, 'Ticket claimed', `You are now assigned to ticket #${claimedTicket.number}.`));
}

async function createTranscript(channel, ticket) {
  const messages = [];
  let before;
  do {
    const batch = await channel.messages.fetch({ limit: 100, ...(before ? { before } : {}) });
    messages.push(...batch.values());
    before = batch.last()?.id;
    if (batch.size < 100 || messages.length >= 5_000) break;
  } while (before);

  const body = messages
    .sort((first, second) => first.createdTimestamp - second.createdTimestamp)
    .map((message) => {
      const attachments = [...message.attachments.values()].map((attachment) => `Attachment: ${attachment.url}`);
      const embeds = message.embeds.map((embed) => `Embed: ${embed.title ?? embed.description ?? 'Rich embed'}`);
      const content = message.content || [...attachments, ...embeds].join('\n') || '[No text content]';
      return `[${message.createdAt.toISOString()}] ${message.author.username} (${message.author.id})\n${content}`;
    })
    .join('\n\n');

  return [
    '.analyze Support Ticket Transcript',
    `Ticket: #${ticket.number}`,
    `Requester: ${ticket.ownerId}`,
    `Subject: ${ticket.subject}`,
    `Created: ${ticket.createdAt}`,
    '',
    '─'.repeat(72),
    body || '[No messages found]',
    '',
  ].join('\n');
}

async function sendTranscript(interaction, store, config) {
  const ticket = await getCurrentTicket(interaction, store);
  if (!ticket) return;
  if (!canControlTicket(interaction, ticket, config)) {
    await respond(interaction, errorEmbed(interaction, 'Ticket access required', 'Only the ticket opener or authorized support staff can download its transcript.'));
    return;
  }

  await interaction.deferReply({ ephemeral: true });
  const transcript = await createTranscript(interaction.channel, ticket);
  const file = new AttachmentBuilder(Buffer.from(transcript, 'utf8'), {
    name: `analyze-ticket-${ticket.number}-transcript.txt`,
  });
  await respond(interaction, successEmbed(interaction, 'Transcript ready', `A transcript for ticket #${ticket.number} is attached to this private response.`), { files: [file] });
}

async function addParticipant(interaction, store, config) {
  const ticket = await getCurrentTicket(interaction, store);
  if (!ticket || !await requireSupportMember(interaction, config)) return;
  const user = interaction.options.getUser('user', true);
  if (user.id === ticket.ownerId) {
    await respond(interaction, noticeEmbed(interaction, {
      title: 'Requester already has access',
      description: 'The ticket opener always has access to their ticket.',
      color: COLORS.neutral,
    }));
    return;
  }

  const updatedTicket = await store.addParticipant(interaction.channelId, user.id);
  if (!updatedTicket) {
    await respond(interaction, noticeEmbed(interaction, {
      title: 'Member already has access',
      description: `<@${user.id}> is already listed as a ticket participant.`,
      color: COLORS.neutral,
    }));
    return;
  }
  await interaction.channel.permissionOverwrites.edit(user.id, {
    ViewChannel: true,
    SendMessages: updatedTicket.status === 'open',
    ReadMessageHistory: true,
    AttachFiles: true,
    EmbedLinks: true,
  });
  await respond(interaction, successEmbed(interaction, 'Ticket access granted', `<@${user.id}> can now view ticket #${updatedTicket.number}.`, [
    { name: `${EMOJIS.people} ADDED MEMBER`, value: `<@${user.id}>`, inline: true },
    { name: `${EMOJIS.database} TICKET`, value: `#${updatedTicket.number}`, inline: true },
  ]));
}

async function removeParticipant(interaction, store, config) {
  const ticket = await getCurrentTicket(interaction, store);
  if (!ticket || !await requireSupportMember(interaction, config)) return;
  const user = interaction.options.getUser('user', true);
  const updatedTicket = await store.removeParticipant(interaction.channelId, user.id);
  if (!updatedTicket) {
    await respond(interaction, noticeEmbed(interaction, {
      title: 'Member is not a participant',
      description: `<@${user.id}> does not have participant access to this ticket.`,
      color: COLORS.neutral,
    }));
    return;
  }
  await interaction.channel.permissionOverwrites.delete(user.id).catch(() => null);
  await respond(interaction, successEmbed(interaction, 'Ticket access removed', `<@${user.id}> can no longer view ticket #${updatedTicket.number}.`));
}

const DAY_MS = 24 * 60 * 60 * 1000;
const DEFAULT_CLEANUP_DAYS = 7;

async function cleanupClosedTickets(interaction, store, config) {
  if (!interaction.inGuild()) {
    await respond(interaction, errorEmbed(interaction, 'Server-only action', 'Ticket cleanup can only be run inside a server.'));
    return;
  }
  if (!await requireSupportMember(interaction, config)) return;

  const olderThanDays = interaction.options.getInteger('older_than_days') ?? DEFAULT_CLEANUP_DAYS;
  const cutoff = Date.now() - (olderThanDays * DAY_MS);

  await interaction.deferReply({ ephemeral: true });

  const closedTickets = await store.listTickets(interaction.guildId, 'closed');
  const eligible = closedTickets.filter((ticket) => ticket.closedAt && Date.parse(ticket.closedAt) <= cutoff);

  if (!eligible.length) {
    await respond(interaction, noticeEmbed(interaction, {
      title: 'Nothing to clean up',
      description: olderThanDays > 0
        ? `No closed tickets have been archived for more than ${olderThanDays} day(s).`
        : 'No closed tickets were found in this server.',
      color: COLORS.neutral,
    }));
    return;
  }

  let deletedCount = 0;
  let alreadyGoneCount = 0;
  for (const ticket of eligible) {
    const channel = await interaction.guild.channels.fetch(ticket.channelId).catch(() => null);
    if (!channel) {
      alreadyGoneCount += 1;
      continue;
    }
    const deleted = await channel.delete(`Ticket #${ticket.number} cleaned up by ${interaction.user.tag} (closed ${olderThanDays}+ days ago)`).catch(() => null);
    if (deleted) deletedCount += 1;
  }

  await auditLog(interaction.client, interaction.guildId, {
    action: 'TICKET_CLEANUP',
    actorId: interaction.user.id,
    target: `${deletedCount} ticket channel(s)`,
    detail: `<@${interaction.user.id}> ran a cleanup of ticket channels closed for more than ${olderThanDays} day(s). Ticket records are kept for history and \`/lookup\`; only the Discord channels were removed.`,
    color: COLORS.warning,
  });

  await respond(interaction, successEmbed(interaction, 'Cleanup complete', `Deleted ${deletedCount} archived channel(s)${alreadyGoneCount ? ` (${alreadyGoneCount} were already gone)` : ''}. Ticket records remain intact for history and \`/lookup\`.`));
}

async function handleTicketCommand(interaction, store, config) {
  const subcommand = interaction.options.getSubcommand();
  if (subcommand === 'panel') {
    if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
      await respond(interaction, errorEmbed(interaction, 'Permission required', 'You need the **Manage Server** permission to refresh the support panel.'));
      return;
    }
    await interaction.deferReply({ ephemeral: true });

    // Build overrides from the optional channel/category options.
    const panelUpdates = {};
    const chosenChannel = interaction.options.getChannel('channel');
    const chosenCategory = interaction.options.getChannel('category');
    if (chosenChannel) {
      panelUpdates.supportChannelId = chosenChannel.id;
      config = { ...config, supportChannelId: chosenChannel.id };
    }
    if (chosenCategory) {
      panelUpdates.categoryId = chosenCategory.id;
      config = { ...config, categoryId: chosenCategory.id };
    }

    const result = await ensureTicketPanel(interaction.client, store, config, panelUpdates);

    const details = [];
    if (chosenChannel) details.push(`${EMOJIS.announce} **Panel channel** → <#${chosenChannel.id}>`);
    if (chosenCategory) details.push(`${EMOJIS.ticket} **Ticket category** → <#${chosenCategory.id}>`);
    const extra = details.length ? `\n\n${details.join('\n')}` : '';

    await respond(interaction, successEmbed(
      interaction,
      result.created ? 'Support panel posted' : 'Support panel refreshed',
      `The main ticket panel is available in <#${result.channel.id}>.${extra}`,
    ));
    return;
  }

  if (subcommand === 'add') return addParticipant(interaction, store, config);
  if (subcommand === 'remove') return removeParticipant(interaction, store, config);
  if (subcommand === 'close') return requestClose(interaction, store, config);
  if (subcommand === 'cleanup') return cleanupClosedTickets(interaction, store, config);
  return sendTranscript(interaction, store, config);
}

async function handleTicketInteraction(interaction, store, config) {
  // Resolve guild-specific panel overrides to build the effective config.
  const panel = interaction.inGuild() ? await store.getPanel(interaction.guildId) : null;
  const effectiveConfig = getTicketConfig(process.env, panel || {});
  if (config) Object.assign(effectiveConfig, config);
  config = effectiveConfig;

  if (interaction.isChatInputCommand() && interaction.commandName === 'ticket') {
    await handleTicketCommand(interaction, store, config);
    return true;
  }

  if (interaction.isModalSubmit() && interaction.customId === 'ticket:create-modal') {
    await createTicketFromModal(interaction, store, config);
    return true;
  }

  if (!interaction.isButton() || !interaction.customId.startsWith('ticket:')) return false;
  if (interaction.customId === 'ticket:create') {
    await showCreateModal(interaction);
    return true;
  }
  if (interaction.customId === 'ticket:close') {
    await requestClose(interaction, store, config);
    return true;
  }
  if (interaction.customId === 'ticket:close-confirm') {
    await closeTicket(interaction, store, config);
    return true;
  }
  if (interaction.customId === 'ticket:close-cancel') {
    await interaction.update({
      embeds: [noticeEmbed(interaction, {
        title: 'Close cancelled',
        description: 'The ticket remains open and available for replies.',
        color: COLORS.neutral,
      })],
      components: [],
      allowedMentions: NO_MENTIONS,
    });
    return true;
  }
  if (interaction.customId === 'ticket:claim') {
    await claimTicket(interaction, store, config);
    return true;
  }

  if (interaction.customId === 'ticket:transcript') {
    await sendTranscript(interaction, store, config);
    return true;
  }
  if (interaction.customId === 'ticket:reopen') {
    await reopenTicket(interaction, store, config);
    return true;
  }
  if (interaction.customId === 'ticket:delete') {
    await deleteArchivedTicket(interaction, store, config);
    return true;
  }
  return false;
}

module.exports = {
  ensureTicketPanel,
  getTicketConfig,
  handleTicketInteraction,
  isSupportMember,
  ticketCommand,
};
