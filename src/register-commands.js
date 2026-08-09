require('dotenv').config();

const { REST, Routes } = require('discord.js');
const { blacklistCommand } = require('./blacklist-command');
const { ticketCommand } = require('./ticket-suite');
const { watchlistCommand } = require('./watchlist-command');
const { caseCommand } = require('./case-command');
const { robloxCommand } = require('./roblox');
const { lookupCommand } = require('./lookup-command');
const { automodCommand } = require('./automod/automod-command');
const { moderationCommand } = require('./moderation-commands');
const { lockdownCommand } = require('./lockdown-command');
const { antinukeCommand } = require('./antinuke/antinuke-command');
const { antiraidCommand } = require('./antiraid/antiraid-command');

const { DISCORD_TOKEN: token, CLIENT_ID: clientId, GUILD_ID: guildId } = process.env;
if (!token || !clientId) {
  throw new Error('DISCORD_TOKEN and CLIENT_ID are required to register slash commands.');
}

const commands = [
  blacklistCommand,
  ticketCommand,
  watchlistCommand,
  caseCommand,
  robloxCommand,
  lookupCommand,
  automodCommand,
  moderationCommand,
  lockdownCommand,
  antinukeCommand,
  antiraidCommand,
];

const rest = new REST({ version: '10' }).setToken(token);
const route = guildId
  ? Routes.applicationGuildCommands(clientId, guildId)
  : Routes.applicationCommands(clientId);

async function registerCommands() {
  await rest.put(route, { body: commands.map((command) => command.toJSON()) });
  console.log(`Registered /${commands.map((command) => command.name).join(', /')} ${guildId ? `in guild ${guildId}` : 'globally'}.`);
}

module.exports = { registerCommands };
