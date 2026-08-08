# .analyze Discord bot

The initial .analyze bot provides a persistent blacklist for investigated ERLC community accounts and Discord servers.

## What `/blacklist` does

| Command | Result |
| --- | --- |
| `/blacklist member user reason` | Saves a blacklist entry for the current Discord server, bans the member when possible, and bans them again if they rejoin. |
| `/blacklist server server_id reason` | Adds a bot-wide server denylist entry. The bot leaves that server if present and leaves it whenever it is invited again. |
| `/blacklist remove-member` / `remove-server` | Removes the relevant record. Removing a member record never unbans them automatically. |
| `/blacklist check-member` / `check-server` | Lets any member check a record privately. |

The command is visible to everyone. Changes require the Discord **Manage Server** permission, which prevents any ordinary member from banning people or denying the bot access to servers. This is deliberately separate from the bot's **Ban Members** permission: the first controls who may request a blacklist, while the second lets the bot enforce member blacklists.

Server blacklists apply to the bot itself, not to arbitrary Discord users: Discord has no API that allows a bot to ban or shut down another server.

## Ticket / Support Suite

The `.analyze` bot includes a private ticket system for investigations, reports, and community concerns.

### How it works

1. A staff member runs `/ticket panel` to post a **Support Centre** embed in a designated channel.
2. A user clicks **Open a ticket**, fills in a subject and details via a modal dialog.
3. A private channel is created under a configurable category. Only the requester, the bot, and staff can see it.
4. Staff use the **Claim** button to assign themselves, and the conversation continues in the channel.
5. Either the requester or staff can close the ticket. Transcripts are available at any time.

### `/ticket` subcommands

| Command | Result |
| --- | --- |
| `/ticket panel [channel] [category]` | Posts or refreshes the support panel. Optionally sets the panel channel and ticket category for this server. Requires **Manage Server**. |
| `/ticket add user` | Gives a member access to the current ticket. Staff only. |
| `/ticket remove user` | Removes a member from the current ticket. Staff only. |
| `/ticket close` | Closes the current ticket (locks replies for the requester). |
| `/ticket reopen` | Reopens a closed ticket. |
| `/ticket transcript` | Downloads a plain-text transcript of the current ticket. |

### Button controls

Inside each ticket channel, an action row provides **Claim**, **Transcript**, and **Close ticket** buttons. Closed tickets show **Reopen ticket** and **Transcript** buttons instead.

### Configuration

| Environment variable | Purpose | Required |
| --- | --- | --- |
| `TICKET_CATEGORY_ID` | Default category channel where ticket channels are created. | No (has a built-in default; can be overridden per-guild via `/ticket panel`). |
| `SUPPORT_CHANNEL_ID` | Default channel where the support panel embed is posted. | No (has a built-in default; can be overridden per-guild via `/ticket panel`). |
| `SUPPORT_ROLE_ID` | Role whose members can claim and manage tickets. | No. Admins, Manage Server, and Manage Channels holders always have access. |

Per-guild overrides set via `/ticket panel channel:<#channel> category:<#category>` are persisted and take priority over the environment variables.

Ticket records are stored at `data/tickets.json`, which is intentionally ignored by Git so investigations stay local to the deployment.

## Audit Log

All moderation-relevant actions — blacklist changes, ticket open/claim/close, watchlist changes, and case activity — are sent as branded embeds to a single audit channel, so staff have one place to review activity across every system.

Set `AUDIT_LOG_CHANNEL_ID` to a text channel ID in each guild. If it's unset (or the bot can't reach the channel), audit logging silently no-ops — nothing else is affected.

## Watchlist

A lighter tier than blacklisting: flag a member or server as suspicious without banning them or leaving the server. Watchlist entries surface automatically in `/lookup`.

### `/watchlist` subcommands

| Command | Result |
| --- | --- |
| `/watchlist add-member user reason` | Flags a member as suspicious in this server. No ban is applied. |
| `/watchlist add-server server_id reason` | Flags a server as suspicious bot-wide. The bot does not leave it. |
| `/watchlist remove-member` / `remove-server` | Removes the relevant flag. |
| `/watchlist check-member` / `check-server` | Lets any member check a flag privately. |

Adding or removing a flag requires **Manage Server**; checking is open to everyone. Watchlist records use an amber embed color to visually separate them from blacklist (red) records. Flags support an internal notes log for follow-up context, though no slash command currently appends notes — that's a natural next step if it's needed.

Watchlist records are stored at `data/watchlists.json`, ignored by Git.

## Roblox Lookup

Looks up a Roblox account by username or ID using Roblox's public, unauthenticated web API — no API key required.

### `/roblox` subcommands

| Command | Result |
| --- | --- |
| `/roblox user username` | Looks up a Roblox account by username. |
| `/roblox id roblox_id` | Looks up a Roblox account by numeric user ID. |

Results show the display name, username, user ID, account creation date, description, avatar, a link to the profile, and whether the account is banned on Roblox. Lookups are cached in memory for 5 minutes to avoid hitting Roblox's rate limits. Results are ephemeral and are not persisted — there is currently no stored link between a Roblox account and a Discord account.

## Case / Investigation Tracker

Structured, multi-session investigation management: a case tracks a subject, full details, staff notes over time, linked subjects, and an eventual verdict.

### `/case` subcommands

| Command | Result |
| --- | --- |
| `/case open subject details` | Opens a new investigation case. |
| `/case close case_number verdict` | Closes a case with a final verdict. |
| `/case note case_number text` | Adds a timestamped note to a case. |
| `/case view case_number` | Views a case's full details, including notes and linked subjects. |
| `/case list [status]` | Lists cases in this server, optionally filtered to `open` or `closed`. |
| `/case link case_number user_or_server_id` | Links a Discord user or server ID to a case, so it surfaces later in `/lookup`. |
| `/case report case_number` | Generates a downloadable `.txt` case file with the full evidence trail — subject, details, verdict, every linked subject, and every note in full (not just the most recent few shown in `/case view`). |

All `/case` subcommands are restricted to support staff (Administrator, Manage Server, Manage Channels, or the configured `SUPPORT_ROLE_ID`) — including viewing and listing cases, since case files often contain sensitive investigation details.

Case records are stored at `data/cases.json`, ignored by Git.

## Unified Lookup

Cross-references a subject across every system in a single, private response.

### `/lookup` subcommands

| Command | Result |
| --- | --- |
| `/lookup user user` | Aggregates blacklist, watchlist, ticket, and case results for a Discord member. |
| `/lookup server server_id` | Aggregates blacklist, watchlist, and case results for a Discord server ID. |
| `/lookup roblox username` | Looks up a Roblox account. Discord cross-referencing requires a persisted Roblox↔Discord link, which isn't implemented yet. |

`/lookup` is available to all members and always replies ephemerally, since it can surface sensitive investigation history. Each section shows "No records found" when a system has nothing on file. Every run is recorded in the audit log for accountability.

## Setup

1. Install Node.js 20 or later.
2. Run `npm install`.
3. Copy `.env.example` to `.env`, then set `DISCORD_TOKEN` and `CLIENT_ID`.
4. In the [Discord Developer Portal](https://discord.com/developers/applications), enable the **Server Members Intent** for the bot. Invite it with the `bot` and `applications.commands` scopes. Give it **Ban Members** if member blacklists should be enforced, **Manage Channels** for the ticket system, and **Use External Emojis** so the .analyze branded embeds render in every server.
5. For immediate development registration, set `GUILD_ID` to a test server ID. Run `npm run register`, then `npm start`.

Leave `GUILD_ID` empty to register commands globally. Global commands can take up to an hour to appear.

Blacklist records are stored at `data/blacklists.json`, which is intentionally ignored by Git so investigations stay local to the deployment.

## Verification

Run the store tests without a Discord token:

```sh
npm test
```
