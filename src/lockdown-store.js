const fs = require('node:fs/promises');

class LockdownStore {
  constructor(filePath) {
    this.filePath = filePath;
    this.data = {};
  }

  async init() {
    try {
      const content = await fs.readFile(this.filePath, 'utf8');
      this.data = JSON.parse(content);
    } catch (error) {
      this.data = {};
      await this.save();
    }
  }

  async save() {
    await fs.writeFile(this.filePath, JSON.stringify(this.data, null, 2));
  }

  isLocked(guildId) {
    return this.data[guildId]?.locked || false;
  }

  getLockdown(guildId) {
    return this.data[guildId] || null;
  }

  async setLockdown(guildId, data) {
    this.data[guildId] = {
      locked: true,
      lockedAt: new Date().toISOString(),
      lockedBy: data.lockedBy,
      reason: data.reason,
      channelsLocked: data.channelsLocked || [],
    };
    await this.save();
  }

  async removeLockdown(guildId) {
    delete this.data[guildId];
    await this.save();
  }
}

module.exports = { LockdownStore };
