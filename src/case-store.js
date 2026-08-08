const fs = require('node:fs/promises');
const path = require('node:path');

const EMPTY_DATA = Object.freeze({
  version: 1,
  nextCaseNumber: 1,
  cases: {},
});

/**
 * Small JSON-backed store for investigation cases. Same file-backed pattern
 * as BlacklistStore / TicketStore / WatchlistStore: serialized writes,
 * atomic rename() on save.
 */
class CaseStore {
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

  async createCase({ guildId, subject, details, openedBy }) {
    return this.#mutate((data) => {
      const number = data.nextCaseNumber;
      data.nextCaseNumber += 1;
      const record = {
        number,
        guildId,
        subject,
        details,
        status: 'open',
        openedBy,
        openedAt: new Date().toISOString(),
        closedBy: null,
        closedAt: null,
        verdict: null,
        linkedIds: [],
        notes: [],
      };
      data.cases[number] = record;
      return record;
    });
  }

  async getCase(guildId, caseNumber) {
    await this.init();
    const record = this.data.cases[caseNumber];
    return record && record.guildId === guildId ? record : null;
  }

  async closeCase(guildId, caseNumber, { closedBy, verdict }) {
    return this.#mutate((data) => {
      const record = data.cases[caseNumber];
      if (!record || record.guildId !== guildId || record.status === 'closed') return null;
      record.status = 'closed';
      record.closedBy = closedBy;
      record.closedAt = new Date().toISOString();
      record.verdict = verdict;
      return record;
    });
  }

  async addNote(guildId, caseNumber, { authorId, text }) {
    return this.#mutate((data) => {
      const record = data.cases[caseNumber];
      if (!record || record.guildId !== guildId) return null;
      const note = { authorId, text, addedAt: new Date().toISOString() };
      record.notes.push(note);
      return record;
    });
  }

  async linkId(guildId, caseNumber, linkedId) {
    return this.#mutate((data) => {
      const record = data.cases[caseNumber];
      if (!record || record.guildId !== guildId) return null;
      if (!record.linkedIds.includes(linkedId)) record.linkedIds.push(linkedId);
      return record;
    });
  }

  async listCases(guildId, status = null) {
    await this.init();
    return Object.values(this.data.cases)
      .filter((record) => record.guildId === guildId && (!status || record.status === status))
      .sort((first, second) => second.number - first.number);
  }

  async findCasesByLinkedId(guildId, linkedId) {
    await this.init();
    return Object.values(this.data.cases)
      .filter((record) => record.guildId === guildId && record.linkedIds.includes(linkedId))
      .sort((first, second) => second.number - first.number);
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
      throw new Error('Case data must be a JSON object.');
    }

    return {
      version: 1,
      nextCaseNumber: Number.isInteger(value.nextCaseNumber) && value.nextCaseNumber > 0
        ? value.nextCaseNumber
        : 1,
      cases: this.#objectOrEmpty(value.cases),
    };
  }

  #objectOrEmpty(value) {
    return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  }
}

module.exports = { CaseStore };
