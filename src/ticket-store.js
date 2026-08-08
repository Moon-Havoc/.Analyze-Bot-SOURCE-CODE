const fs = require('node:fs/promises');
const path = require('node:path');

const EMPTY_DATA = Object.freeze({
  version: 1,
  nextTicketNumber: 1,
  panels: {},
  tickets: {},
});

class TicketStore {
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
        this.data = this.#validate(JSON.parse(await fs.readFile(this.filePath, 'utf8')));
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

  async getPanel(guildId) {
    await this.init();
    return this.data.panels[guildId] ?? null;
  }

  async setPanel(guildId, panel) {
    return this.#mutate((data) => {
      data.panels[guildId] = { ...panel, updatedAt: new Date().toISOString() };
      return data.panels[guildId];
    });
  }

  async allocateTicketNumber() {
    return this.#mutate((data) => {
      const ticketNumber = data.nextTicketNumber;
      data.nextTicketNumber += 1;
      return ticketNumber;
    });
  }

  async createTicket(ticket) {
    return this.#mutate((data) => {
      const existing = Object.values(data.tickets).find((item) => (
        item.guildId === ticket.guildId
        && item.ownerId === ticket.ownerId
        && item.status === 'open'
      ));
      if (existing) return { created: false, ticket: existing };

      const record = {
        ...ticket,
        status: 'open',
        claimedBy: null,
        participants: [],
        createdAt: new Date().toISOString(),
        closedAt: null,
        closedBy: null,
      };
      data.tickets[ticket.channelId] = record;
      return { created: true, ticket: record };
    });
  }

  async getTicket(channelId) {
    await this.init();
    return this.data.tickets[channelId] ?? null;
  }

  async findOpenTicketByOwner(guildId, ownerId) {
    await this.init();
    return Object.values(this.data.tickets).find((ticket) => (
      ticket.guildId === guildId && ticket.ownerId === ownerId && ticket.status === 'open'
    )) ?? null;
  }

  async getTicketsByOwner(guildId, ownerId) {
    await this.init();
    return Object.values(this.data.tickets).filter((ticket) => (
      ticket.guildId === guildId && ticket.ownerId === ownerId
    ));
  }

  async listTickets(guildId, status = null) {
    await this.init();
    return Object.values(this.data.tickets)
      .filter((ticket) => ticket.guildId === guildId && (!status || ticket.status === status))
      .sort((first, second) => second.number - first.number);
  }

  async claimTicket(channelId, staffId) {
    return this.#mutate((data) => {
      const ticket = data.tickets[channelId];
      if (!ticket || ticket.status !== 'open') return null;
      ticket.claimedBy = staffId;
      ticket.claimedAt = new Date().toISOString();
      return ticket;
    });
  }

  async closeTicket(channelId, closedBy) {
    return this.#mutate((data) => {
      const ticket = data.tickets[channelId];
      if (!ticket || ticket.status === 'closed') return null;
      ticket.status = 'closed';
      ticket.closedBy = closedBy;
      ticket.closedAt = new Date().toISOString();
      return ticket;
    });
  }

  async reopenTicket(channelId) {
    return this.#mutate((data) => {
      const ticket = data.tickets[channelId];
      if (!ticket || ticket.status === 'open') return null;
      ticket.status = 'open';
      ticket.closedBy = null;
      ticket.closedAt = null;
      return ticket;
    });
  }

  async addParticipant(channelId, userId) {
    return this.#mutate((data) => {
      const ticket = data.tickets[channelId];
      if (!ticket || ticket.participants.includes(userId)) return null;
      ticket.participants.push(userId);
      return ticket;
    });
  }

  async removeParticipant(channelId, userId) {
    return this.#mutate((data) => {
      const ticket = data.tickets[channelId];
      if (!ticket || !ticket.participants.includes(userId)) return null;
      ticket.participants = ticket.participants.filter((id) => id !== userId);
      return ticket;
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
    this.writeQueue = operation.then(() => undefined, () => undefined);
    return operation;
  }

  async #write() {
    const temporaryPath = `${this.filePath}.${process.pid}.tmp`;
    await fs.writeFile(temporaryPath, `${JSON.stringify(this.data, null, 2)}\n`, 'utf8');
    await fs.rename(temporaryPath, this.filePath);
  }

  #validate(value) {
    if (!value || typeof value !== 'object') throw new Error('Ticket data must be a JSON object.');
    return {
      version: 1,
      nextTicketNumber: Number.isInteger(value.nextTicketNumber) && value.nextTicketNumber > 0
        ? value.nextTicketNumber
        : 1,
      panels: this.#objectOrEmpty(value.panels),
      tickets: this.#objectOrEmpty(value.tickets),
    };
  }

  #objectOrEmpty(value) {
    return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  }
}

module.exports = { TicketStore };
