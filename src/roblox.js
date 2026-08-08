const { SlashCommandBuilder } = require('discord.js');
const { COLORS, EMOJIS, NO_MENTIONS, brandedEmbed, noticeEmbed } = require('./brand');
const { auditLog } = require('./audit');

const CACHE_TTL_MS = 5 * 60 * 1000;
const cache = new Map();

const robloxCommand = new SlashCommandBuilder()
  .setName('roblox')
  .setDescription('Look up a Roblox account.')
  .addSubcommand((subcommand) => subcommand
    .setName('user')
    .setDescription('Look up a Roblox user by username.')
    .addStringOption((option) => option
      .setName('username')
      .setDescription('Roblox username')
      .setRequired(true)))
  .addSubcommand((subcommand) => subcommand
    .setName('id')
    .setDescription('Look up a Roblox user by numeric ID.')
    .addStringOption((option) => option
      .setName('roblox_id')
      .setDescription('Roblox numeric user ID')
      .setRequired(true)));

function cacheGet(key) {
  const entry = cache.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    cache.delete(key);
    return null;
  }
  return entry.value;
}

function cacheSet(key, value) {
  cache.set(key, { value, expiresAt: Date.now() + CACHE_TTL_MS });
}

/**
 * Resolve a Roblox username to a full profile, using the public
 * (unauthenticated) Roblox web APIs.
 * @returns {Promise<object|null>} profile or null if not found
 */
async function fetchRobloxUser(username) {
  const cacheKey = `username:${username.toLowerCase()}`;
  const cached = cacheGet(cacheKey);
  if (cached !== null) return cached;

  const lookupResponse = await fetch('https://users.roblox.com/v1/usernames/users', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ usernames: [username], excludeBannedUsers: false }),
  });
  if (!lookupResponse.ok) throw new Error(`Roblox username lookup failed (${lookupResponse.status}).`);

  const lookupData = await lookupResponse.json();
  const match = lookupData?.data?.[0];
  if (!match) {
    cacheSet(cacheKey, null);
    return null;
  }

  const profile = await fetchRobloxUserById(match.id);
  cacheSet(cacheKey, profile);
  return profile;
}

/**
 * Fetch a Roblox profile by numeric user ID, using the public
 * (unauthenticated) Roblox web APIs.
 * @returns {Promise<object|null>} profile or null if not found
 */
async function fetchRobloxUserById(userId) {
  const cacheKey = `id:${userId}`;
  const cached = cacheGet(cacheKey);
  if (cached !== null) return cached;

  const profileResponse = await fetch(`https://users.roblox.com/v1/users/${userId}`);
  if (profileResponse.status === 404) {
    cacheSet(cacheKey, null);
    return null;
  }
  if (!profileResponse.ok) throw new Error(`Roblox profile lookup failed (${profileResponse.status}).`);
  const profile = await profileResponse.json();

  let avatarUrl = null;
  try {
    const avatarResponse = await fetch(
      `https://thumbnails.roblox.com/v1/users/avatar-headshot?userIds=${profile.id}&size=150x150&format=Png`,
    );
    if (avatarResponse.ok) {
      const avatarData = await avatarResponse.json();
      avatarUrl = avatarData?.data?.[0]?.imageUrl ?? null;
    }
  } catch {
    avatarUrl = null;
  }

  const result = {
    id: profile.id,
    name: profile.name,
    displayName: profile.displayName,
    description: profile.description || '',
    created: profile.created,
    isBanned: Boolean(profile.isBanned),
    avatarUrl,
  };
  cacheSet(cacheKey, result);
  return result;
}

function truncate(text, maxLength = 300) {
  if (!text) return '*No description set*';
  return text.length > maxLength ? `${text.slice(0, maxLength).trim()}…` : text;
}

function robloxProfileEmbed(interaction, profile) {
  const createdAt = Math.floor(Date.parse(profile.created) / 1000);
  const embed = brandedEmbed(interaction, {
    title: `${EMOJIS.people} Roblox account — ${profile.displayName}`,
    description: `[View profile on Roblox](https://www.roblox.com/users/${profile.id}/profile)`,
    color: profile.isBanned ? COLORS.danger : COLORS.brand,
    fields: [
      { name: `${EMOJIS.people} USERNAME`, value: `\`${profile.name}\``, inline: true },
      { name: `${EMOJIS.database} USER ID`, value: `\`${profile.id}\``, inline: true },
      { name: `${EMOJIS.online} ACCOUNT STATUS`, value: profile.isBanned ? 'Banned on Roblox' : 'Active', inline: true },
      { name: `${EMOJIS.database} ACCOUNT CREATED`, value: `<t:${createdAt}:F>\n<t:${createdAt}:R>` },
      { name: `${EMOJIS.ticket} DESCRIPTION`, value: `> ${truncate(profile.description).replace(/\n/g, '\n> ')}` },
    ],
  });
  if (profile.avatarUrl) embed.setThumbnail(profile.avatarUrl);
  return embed;
}

async function respond(interaction, embed) {
  await interaction.editReply({ embeds: [embed], allowedMentions: NO_MENTIONS });
}

async function handleRobloxCommand(interaction) {
  const subcommand = interaction.options.getSubcommand();
  await interaction.deferReply({ ephemeral: true });

  try {
    let profile;
    if (subcommand === 'user') {
      const username = interaction.options.getString('username', true).trim();
      profile = await fetchRobloxUser(username);
      if (!profile) {
        await respond(interaction, noticeEmbed(interaction, {
          title: 'No account found',
          description: `No Roblox account exists with the username \`${username}\`.`,
          color: COLORS.neutral,
        }));
        return;
      }
    } else {
      const robloxId = interaction.options.getString('roblox_id', true).trim();
      if (!/^\d+$/.test(robloxId)) {
        await respond(interaction, noticeEmbed(interaction, {
          title: 'Invalid Roblox ID',
          description: 'Provide a numeric Roblox user ID.',
          color: COLORS.warning,
        }));
        return;
      }
      profile = await fetchRobloxUserById(robloxId);
      if (!profile) {
        await respond(interaction, noticeEmbed(interaction, {
          title: 'No account found',
          description: `No Roblox account exists with ID \`${robloxId}\`.`,
          color: COLORS.neutral,
        }));
        return;
      }
    }

    await respond(interaction, robloxProfileEmbed(interaction, profile));

    if (interaction.inGuild()) {
      await auditLog(interaction.client, interaction.guildId, {
        action: 'LOOKUP',
        actorId: interaction.user.id,
        target: `Roblox: ${profile.name} (${profile.id})`,
        detail: `<@${interaction.user.id}> looked up a Roblox account.`,
        color: COLORS.brand,
      });
    }
  } catch (error) {
    console.error('Roblox lookup failed:', error);
    await respond(interaction, noticeEmbed(interaction, {
      title: 'Lookup failed',
      description: 'Could not reach the Roblox API. Please try again shortly.',
      color: COLORS.warning,
    }));
  }
}

module.exports = {
  robloxCommand,
  handleRobloxCommand,
  fetchRobloxUser,
  fetchRobloxUserById,
};
