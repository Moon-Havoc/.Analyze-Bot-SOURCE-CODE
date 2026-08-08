const fs = require('node:fs/promises');
const path = require('node:path');

const EMPTY_DATA = Object.freeze({
  version: 1,
  members: {},
  servers: {},
});

function memberKey(guildId, userId) {
  return `${guildId}:${userId}`;
}

/**
 * Small JSON-backed store for watchlist records — a lighter, non-enforcing
 * tier below blacklisting. Same file-backed pattern as BlacklistStore /
 * TicketStore: serialized writes, atomic rename() on save.
 */
class WatchlistStore {
  constructor(filePath) {
    this.filePath = filePath;
    this.data = null;
    this.initializing = null;
    this.writeQueue = Promise.resolve();
  }

  async init() {
    if (this.data) return;
    if (this.initializing) return this.initializing;

    this.initializing = (async () => {
      await fs.mkdir(path.dirname(this.filePath), { recursive: true });

      try {
        const raw = await fs.readFile(this.filePath, 'utf8');
        this.data = this.#validate(JSON.parse(raw));
      } catch (error) {
        if (error.code !== 'ENOENT') throw error;
        this.data = structuredClone(EMPTY_DATA);
        await this.#write();
      }
    })();

    try {
      await this.initializing;
    } finally {
      this.initializing = null;
    }
  }

  async addMember(guildId, userId, { reason, addedBy }) {
    return this.#mutate((data) => {
      const record = {
        guildId,
        userId,
        reason,
        addedBy,
        addedAt: new Date().toISOString(),
        notes: [],
      };
      data.members[memberKey(guildId, userId)] = record;
      return record;
    });
  }

  async removeMember(guildId, userId) {
    return this.#mutate((data) => {
      const key = memberKey(guildId, userId);
      if (!data.members[key]) return false;
      delete data.members[key];
      return true;
    });
  }

  async getMember(guildId, userId) {
    await this.init();
    return this.data.members[memberKey(guildId, userId)] ?? null;
  }

  async addGuild(serverId, { reason, addedBy }) {
    return this.#mutate((data) => {
      const record = {
        serverId,
        reason,
        addedBy,
        addedAt: new Date().toISOString(),
        notes: [],
      };
      data.servers[serverId] = record;
      return record;
    });
  }

  async removeGuild(serverId) {
    return this.#mutate((data) => {
      if (!data.servers[serverId]) return false;
      delete data.servers[serverId];
      return true;
    });
  }

  async getGuild(serverId) {
    await this.init();
    return this.data.servers[serverId] ?? null;
  }

  /**
   * Finds this member's watchlist flag in every guild the bot has data for.
   * Same cross-server intelligence purpose as BlacklistStore.findMemberAcrossGuilds.
   * @returns {Promise<Array<object>>}
   */
  async findMemberAcrossGuilds(userId) {
    await this.init();
    return Object.values(this.data.members).filter((record) => record.userId === userId);
  }

  async addNote(scope, id, { authorId, text }) {
    return this.#mutate((data) => {
      const bucket = scope === 'member' ? data.members : data.servers;
      const record = bucket[id];
      if (!record) return null;
      const note = { authorId, text, addedAt: new Date().toISOString() };
      record.notes.push(note);
      return note;
    });
  }

  async #mutate(mutator) {
    await this.init();

    const operation = this.writeQueue
      .catch(() => undefined)
      .then(async () => {
        const result = mutator(this.data);
        await this.#write();
        return result;
      });

    this.writeQueue = operation.then(
      () => undefined,
      () => undefined,
    );
    return operation;
  }

  async #write() {
    const temporaryPath = `${this.filePath}.${process.pid}.tmp`;
    await fs.writeFile(temporaryPath, `${JSON.stringify(this.data, null, 2)}\n`, 'utf8');
    await fs.rename(temporaryPath, this.filePath);
  }

  #validate(value) {
    if (!value || typeof value !== 'object') {
      throw new Error('Watchlist data must be a JSON object.');
    }

    return {
      version: 1,
      members: this.#objectOrEmpty(value.members),
      servers: this.#objectOrEmpty(value.servers),
    };
  }

  #objectOrEmpty(value) {
    return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  }
}

module.exports = { WatchlistStore };
