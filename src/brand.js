const { EmbedBuilder } = require('discord.js');

const EMOJIS = Object.freeze({
  ticket: '<:ticket:1495764599272771764>',
  check: '<:check:1495764355944284291>',
  people: '<:people:1495764437691531385>',
  database: '<:database:1495764658177704108>',
  question: '<:question:1495764491596726293>',
  announce: '<:announce:1495763622947717120>',
  online: '<:online:1495764726163050626>',
  analyze: '<:analyze:1495263396948475914>',
  link: '🔗',
});

const EMOJI_IDS = Object.freeze({
  ticket: '1495764599272771764',
  check: '1495764355944284291',
  people: '1495764437691531385',
  database: '1495764658177704108',
  question: '1495764491596726293',
  announce: '1495763622947717120',
  online: '1495764726163050626',
  analyze: '1495263396948475914',
});

const COLORS = Object.freeze({
  brand: 0x5865F2,
  success: 0x22C55E,
  danger: 0xEF4444,
  warning: 0xF59E0B,
  neutral: 0x64748B,
});

const NO_MENTIONS = Object.freeze({ parse: [] });

function brandedEmbed(interaction, { title, description, fields = [], color = COLORS.brand }) {
  const avatarURL = interaction?.client?.user?.displayAvatarURL({ extension: 'png', size: 256 });
  const embed = new EmbedBuilder()
    .setColor(color)
    .setAuthor({ name: '.analyze • Investigation Network', ...(avatarURL ? { iconURL: avatarURL } : {}) })
    .setTitle(`${EMOJIS.analyze} ${title}`)
    .setDescription(description)
    .setFooter({ text: '.analyze • Investigation Network' })
    .setTimestamp();

  if (fields.length) embed.addFields(fields);
  return embed;
}

function noticeEmbed(interaction, { title, description, color = COLORS.neutral }) {
  return brandedEmbed(interaction, {
    title: `${EMOJIS.question} ${title}`,
    description,
    color,
  });
}

module.exports = { COLORS, EMOJIS, EMOJI_IDS, NO_MENTIONS, brandedEmbed, noticeEmbed };
