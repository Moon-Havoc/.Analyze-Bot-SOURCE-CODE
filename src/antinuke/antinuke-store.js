const fs = require('fs').promises;
const path = require('path');

/**
 * Anti-Nuke Store
 * Manages Anti-Nuke configuration and state persistence
 */

const DEFAULT_CONFIG = {
  enabled: false,
  quarantineRoleId: null,
  panicMode: false,
  thresholds: {
    massBan: 5, // Number of bans in 10 seconds to trigger
    massKick: 10, // Number of kicks in 10 seconds to trigger
    massDelete: 5, // Number of channel deletions in 10 seconds to trigger
    massCreate: 5, // Number of channel creations in 10 seconds to trigger
    massRoleDelete: 3, // Number of role deletions in 10 seconds to trigger
    massRoleCreate: 3, // Number of role creations in 10 seconds to trigger
  },
  whitelist: {
    users: [], // User IDs exempt from anti-nuke
    roles: [], // Role IDs exempt from anti-nuke
  },
  dangerousPermissions: [
    'Administrator',
    'ManageGuild',
    'BanMembers',
    'KickMembers',
    'ManageChannels',
    'ManageRoles',
    'ManageWebhooks',
    'ManageMessages',
    'MentionEveryone',
    'ModerateMembers',
  ],
};

class AntiNukeStore {
  constructor(filePath) {
    this.filePath = filePath;
    this.data = {};
  }

  async init() {
    try {
      const content = await fs.readFile(this.filePath, 'utf8');
      this.data = JSON.parse(content);
      console.log('[AntiNuke Store] Loaded configuration from disk');
    } catch (error) {
      console.log('[AntiNuke Store] No existing configuration, starting fresh');
      this.data = {};
      await this.save();
    }
  }

  async save() {
    await fs.writeFile(this.filePath, JSON.stringify(this.data, null, 2));
  }

  async getGuildConfig(guildId) {
    if (!this.data[guildId]) {
      this.data[guildId] = { ...DEFAULT_CONFIG };
      await this.save();
    }
    return this.data[guildId];
  }

  async setEnabled(guildId, enabled) {
    if (!this.data[guildId]) {
      this.data[guildId] = { ...DEFAULT_CONFIG };
    }
    this.data[guildId].enabled = enabled;
    await this.save();
  }

  async setQuarantineRole(guildId, roleId) {
    if (!this.data[guildId]) {
      this.data[guildId] = { ...DEFAULT_CONFIG };
    }
    this.data[guildId].quarantineRoleId = roleId;
    await this.save();
  }

  async setPanicMode(guildId, enabled) {
    if (!this.data[guildId]) {
      this.data[guildId] = {DEFAULT_CONFIG};
    }
    this.data[guildId].panicMode = enabled;
    await this.save();
  }

  async setThreshold(guildId, type, value) {
    if (!this.data[guildId]) {
      this.data[guildId] = { ...DEFAULT_CONFIG };
    }
    this.data[guildId].thresholds[type] = value;
    await this.save();
  }

  async addWhitelistedUser(guildId, userId) {
    if (!this.data[guildId]) {
      this.data[guildId] = { ...DEFAULT_CONFIG };
    }
    if (!this.data[guildId].whitelist.users.includes(userId)) {
      this.data[guildId].whitelist.users.push(userId);
      await this.save();
    }
  }

  async removeWhitelistedUser(guildId, userId) {
    if (!this.data[guildId]) {
      this.data[guildId] = { ...DEFAULT_CONFIG };
    }
    this.data[guildId].whitelist.users = this.data[guildId].whitelist.users.filter(
      (id) => id !== userId
    );
    await this.save();
  }

  async addWhitelistedRole(guildId, roleId) {
    if (!this.data[guildId]) {
      this.data[guildId] = { ...DEFAULT_CONFIG };
    }
    if (!this.data[guildId].whitelist.roles.includes(roleId)) {
      this.data[guildId].whitelist.roles.push(roleId);
      await this.save();
    }
  }

  async removeWhitelistedRole(guildId, roleId) {
    if (!this.data[guildId]) {
      this.data[guildId] = { ...DEFAULT_CONFIG };
    }
    this.data[guildId].whitelist.roles = this.data[guildId].whitelist.roles.filter(
      (id) => id !== roleId
    );
    await this.save();
  }

  async isUserWhitelisted(guildId, userId) {
    const config = await this.getGuildConfig(guildId);
    return config.whitelist.users.includes(userId);
  }

  async hasWhitelistedRole(guildId, roleIds) {
    const config = await this.getGuildConfig(guildId);
    return roleIds.some((roleId) => config.whitelist.roles.includes(roleId));
  }
}

module.exports = { AntiNukeStore };
