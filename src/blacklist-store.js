const fs = require('node:fs/promises');
const path = require('node:path');

const EMPTY_DATA = Object.freeze({
  version: 1,
  globalGuilds: {},
  guildMembers: {},
});

/**
 * Small JSON-backed store for blacklist records. The writes are serialized and
 * use rename() so an interrupted write cannot leave a partially written file.
 */
class BlacklistStore {
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
      data.guildMembers[guildId] ??= {};
      const record = this.#record(userId, reason, addedBy);
      data.guildMembers[guildId][userId] = record;
      return record;
    });
  }

  async removeMember(guildId, userId) {
    return this.#mutate((data) => {
      const members = data.guildMembers[guildId];
      if (!members?.[userId]) return false;
      delete members[userId];
      if (Object.keys(members).length === 0) delete data.guildMembers[guildId];
      return true;
    });
  }

  async getMember(guildId, userId) {
    await this.init();
    return this.data.guildMembers[guildId]?.[userId] ?? null;
  }

  async addGuild(guildId, { reason, addedBy }) {
    return this.#mutate((data) => {
      const record = this.#record(guildId, reason, addedBy);
      data.globalGuilds[guildId] = record;
      return record;
    });
  }

  async removeGuild(guildId) {
    return this.#mutate((data) => {
      if (!data.globalGuilds[guildId]) return false;
      delete data.globalGuilds[guildId];
      return true;
    });
  }

  async getGuild(guildId) {
    await this.init();
    return this.data.globalGuilds[guildId] ?? null;
  }

  /**
   * Finds this member's blacklist record in every guild the bot has data
   * for, not just one. Powers cross-server "Investigation Network" visibility:
   * a member flagged in one server can be surfaced as a risk signal in another,
   * without merging or overwriting each guild's own independent record.
   * @returns {Promise<Array<{guildId: string, id: string, reason: string, addedBy: string, addedAt: string}>>}
   */
  async findMemberAcrossGuilds(userId) {
    await this.init();
    const results = [];
    for (const [guildId, members] of Object.entries(this.data.guildMembers)) {
      if (members[userId]) results.push({ guildId, ...members[userId] });
    }
    return results;
  }

  #record(id, reason, addedBy) {
    return {
      id,
      reason,
      addedBy,
      addedAt: new Date().toISOString(),
    };
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

    // Keep the queue usable after a failed disk write while still returning
    // the actual error to the command handler that triggered it.
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
      throw new Error('Blacklist data must be a JSON object.');
    }

    return {
      version: 1,
      globalGuilds: this.#objectOrEmpty(value.globalGuilds),
      guildMembers: this.#objectOrEmpty(value.guildMembers),
    };
  }

  #objectOrEmpty(value) {
    return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  }
}

module.exports = { BlacklistStore };
