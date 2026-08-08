require('dotenv').config();

const path = require('node:path');
const { Client, Events, GatewayIntentBits } = require('discord.js');
const { BlacklistStore } = require('./blacklist-store');
const { errorEmbed, handleBlacklistCommand } = require('./blacklist-command');
const { TicketStore } = require('./ticket-store');
const { ensureTicketPanel, getTicketConfig, handleTicketInteraction } = require('./ticket-suite');
const { WatchlistStore } = require('./watchlist-store');
const { handleWatchlistCommand } = require('./watchlist-command');
const { CaseStore } = require('./case-store');
const { handleCaseCommand } = require('./case-command');
const { handleRobloxCommand } = require('./roblox');
const { handleLookupCommand } = require('./lookup-command');
const { NO_MENTIONS } = require('./brand');
const { registerCommands } = require('./register-commands');
const { AutoModStore } = require('./automod/automod-store');
const { processMessage } = require('./automod/automod-engine');
const { handleAutomodCommand, handleAutomodInteraction, handleAutomodSelectMenu } = require('./automod/automod-command');
const { handleModerationCommand } = require('./moderation-commands');

const token = process.env.DISCORD_TOKEN;
if (!token) throw new Error('DISCORD_TOKEN is missing. Copy .env.example to .env and fill it in.');

const blacklistStore = new BlacklistStore(path.join(__dirname, '..', 'data', 'blacklists.json'));
const ticketStore = new TicketStore(path.join(__dirname, '..', 'data', 'tickets.json'));
const watchlistStore = new WatchlistStore(path.join(__dirname, '..', 'data', 'watchlists.json'));
const caseStore = new CaseStore(path.join(__dirname, '..', 'data', 'cases.json'));
const automodStore = new AutoModStore(path.join(__dirname, '..', 'data', 'automod.json'));
const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent],
});

client.once(Events.ClientReady, async (readyClient) => {
  await blacklistStore.init();
  await ticketStore.init();
  await watchlistStore.init();
  await caseStore.init();
  await automodStore.init();

  try {
    await registerCommands();
  } catch (error) {
    console.error('Command registration failed:', error);
  }

  console.log(`Ready as ${readyClient.user.tag}.`);

  // Re-apply the server denylist after a restart.
  for (const guild of readyClient.guilds.cache.values()) {
    if (await blacklistStore.getGuild(guild.id)) {
      console.warn(`Leaving blacklisted server ${guild.id}.`);
      await guild.leave().catch((error) => console.error(`Could not leave ${guild.id}:`, error));
    }
  }

  // Refresh the ticket support panel if a support channel is configured.
  try {
    await ensureTicketPanel(readyClient, ticketStore);
  } catch (error) {
    console.warn('Ticket panel refresh skipped:', error.message);
  }
});

client.on(Events.MessageCreate, async (message) => {
  console.log(`[AutoMod] Message received: ${message.id} from ${message.author.tag} in guild ${message.guildId}, channel ${message.channelId}`);
  try {
    await processMessage(message, automodStore, client);
  } catch (error) {
    console.error('AutoMod processing failed:', error);
  }
});

client.on(Events.InteractionCreate, async (interaction) => {
  try {
    // Route ticket interactions (commands, buttons, modals) first.
    if (await handleTicketInteraction(interaction, ticketStore)) return;

    // Route AutoMod interactions (buttons, select menus).
    if (await handleAutomodInteraction(interaction, automodStore)) return;
    if (await handleAutomodSelectMenu(interaction, automodStore)) return;
  } catch (error) {
    console.error('Interaction handling failed:', error);
    const reply = {
      embeds: [errorEmbed(interaction, 'Something went wrong while handling this interaction. Please try again.')],
      ephemeral: true,
      allowedMentions: NO_MENTIONS,
    };
    if (interaction.deferred || interaction.replied) await interaction.editReply(reply).catch(() => null);
    else await interaction.reply(reply).catch(() => null);
    return;
  }

  if (!interaction.isChatInputCommand()) return;

  const commandHandlers = {
    blacklist: () => handleBlacklistCommand(interaction, blacklistStore),
    watchlist: () => handleWatchlistCommand(interaction, watchlistStore),
    case: () => handleCaseCommand(interaction, caseStore, getTicketConfig()),
    roblox: () => handleRobloxCommand(interaction),
    lookup: () => handleLookupCommand(interaction, {
      blacklist: blacklistStore,
      watchlist: watchlistStore,
      ticket: ticketStore,
      case: caseStore,
    }),
    automod: () => handleAutomodCommand(interaction, automodStore),
    mod: () => handleModerationCommand(interaction),
  };

  const handler = commandHandlers[interaction.commandName];
  if (!handler) return;

  try {
    await handler();
  } catch (error) {
    console.error(`${interaction.commandName} command failed:`, error);
    console.error('Full stack trace:', error.stack);
    const reply = {
      embeds: [errorEmbed(interaction, `Something went wrong while running /${interaction.commandName}. Please try again.`)],
      ephemeral: true,
      allowedMentions: NO_MENTIONS,
    };
    if (interaction.deferred || interaction.replied) await interaction.editReply(reply).catch(() => null);
    else await interaction.reply(reply).catch(() => null);
  }
});

client.on(Events.GuildMemberAdd, async (member) => {
  try {
    const record = await blacklistStore.getMember(member.guild.id, member.id);
    if (!record || !member.bannable) return;
    await member.ban({ reason: `Blacklisted: ${record.reason}` });
  } catch (error) {
    const botMember = member.guild.members.me;
    console.error(
      `Could not enforce blacklist for ${member.id} in guild ${member.guild.id}: ${error.message}`,
      `(bot top role position: ${botMember?.roles.highest.position ?? 'unknown'},`,
      `target top role position: ${member.roles.highest.position},`,
      `bot has Ban Members: ${botMember?.permissions.has('BanMembers') ?? 'unknown'})`,
    );
  }
});

client.on(Events.GuildCreate, async (guild) => {
  try {
    if (await blacklistStore.getGuild(guild.id)) {
      console.warn(`Leaving newly joined blacklisted server ${guild.id}.`);
      await guild.leave();
    }
  } catch (error) {
    console.error(`Could not process newly joined guild ${guild.id}:`, error);
  }
});

client.login(token);
