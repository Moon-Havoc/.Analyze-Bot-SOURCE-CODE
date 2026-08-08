const { COLORS, EMOJIS, NO_MENTIONS, brandedEmbed } = require('./brand');

/**
 * Send a branded audit-log embed to the configured audit channel.
 * Silently no-ops if no audit channel is configured or accessible.
 *
 * @param {import('discord.js').Client} client
 * @param {string} guildId
 * @param {object} entry
 * @param {string} entry.action   – Short action title (e.g. "Ticket Closed")
 * @param {string} entry.actorId  – Discord user ID of the person who performed the action
 * @param {string} entry.target   – Formatted target string (mention, ID, etc.)
 * @param {string} entry.detail   – Description paragraph
 * @param {number} [entry.color]  – Embed color override
 * @param {Array}  [entry.fields] – Extra embed fields
 * @param {Array}  [entry.files]  – File attachments (AttachmentBuilder instances)
 */
async function auditLog(client, guildId, {
  action,
  actorId,
  target,
  detail,
  color = COLORS.brand,
  fields = [],
  files = [],
}) {
  const auditChannelId = process.env.AUDIT_LOG_CHANNEL_ID;
  if (!auditChannelId) return;

  const guild = client.guilds.cache.get(guildId);
  if (!guild) return;

  const channel = await guild.channels.fetch(auditChannelId).catch(() => null);
  if (!channel?.isTextBased()) return;

  const embed = brandedEmbed({ client }, {
    title: `${EMOJIS.database} ${action}`,
    description: detail,
    color,
    fields: [
      { name: `${EMOJIS.people} ACTOR`, value: `<@${actorId}>`, inline: true },
      { name: `${EMOJIS.announce} TARGET`, value: target, inline: true },
      ...fields,
    ],
  });

  await channel.send({
    embeds: [embed],
    files,
    allowedMentions: NO_MENTIONS,
  }).catch(() => null);
}

module.exports = { auditLog };
