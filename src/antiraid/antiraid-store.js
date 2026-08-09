const fs = require('fs').promises;
const path = require('path');

/**
 * Anti-Raid Store
 * Manages Anti-Raid configuration and state persistence
 */

const DEFAULT_CONFIG = {
  enabled: false,
  joinGate: {
    enabled: false,
    minAccountAge: 0, // Minimum account age in milliseconds (0 = disabled)
    requireAvatar: false,
    suspiciousDetection: false,
    blockInviteInUsername: false,
    blockUnverifiedBots: false,
  },
  verification: {
    enabled: false,
    captcha: false,
    captchaType: 'simple', // 'simple' or 'advanced'
  },
  raidDetection: {
    enabled: false,
    maxJoinsPerMinute: 10,
    lockdownDuration: 300000, // 5 minutes
  },
  whitelist: {
    users: [], // User IDs exempt from anti-raid
    roles: [], // Role IDs exempt from anti-raid
  },
};

class AntiRaidStore {
  constructor(filePath) {
    this.filePath = filePath;
    this.data = {};
    this.raidJoins = new Map(); // Track join times for raid detection
  }

  async init() {
    try {
      const content = await fs.readFile(this.filePath, 'utf8');
      this.data = JSON.parse(content);
      console.log('[Anti-Raid Store] Loaded configuration from disk');
    } catch (error) {
      console.log('[Anti-Raid Store] No existing configuration, starting fresh');
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

  async setJoinGateEnabled(guildId, enabled) {
    if (!this.data[guildId]) {
      this.data[guildId] = { ...DEFAULT_CONFIG };
    }
    this.data[guildId].joinGate.enabled = enabled;
    await this.save();
  }

  async setMinAccountAge(guildId, hours) {
    if (!this.data[guildId]) {
      this.data[guildId] = { ...DEFAULT_CONFIG };
    }
    this.data[guildId].joinGate.minAccountAge = hours * 60 * 60 * 1000; // Convert hours to milliseconds
    await this.save();
  }

  async setRequireAvatar(guildId, required) {
    if (!this.data[guildId]) {
      this.data[guildId] = { ...DEFAULT_CONFIG };
    }
    this.data[guildId].joinGate.requireAvatar = required;
    await this.save();
  }

  async setSuspiciousDetection(guildId, enabled) {
    if (!this.data[guildId]) {
      this.data[guildId] = { ...DEFAULT_CONFIG };
    }
    this.data[guildId].joinGate.suspiciousDetection = enabled;
    await this.save();
  }

  async setBlockInviteInUsername(guildId, enabled) {
    if (!this.data[guildId]) {
      this.data[guildId] = { ...DEFAULT_CONFIG };
    }
    this.data[guildId].joinGate.blockInviteInUsername = enabled;
    await this.save();
  }

  async setBlockUnverifiedBots(guildId, enabled) {
    if (!this.data[guildId]) {
      this.data[guildId] = { ...DEFAULT_CONFIG };
    }
    this.data[guildId].joinGate.blockUnverifiedBots = enabled;
    await this.save();
  }

  async setVerificationEnabled(guildId, enabled) {
    if (!this.data[guildId]) {
      this.data[guildId] = { ...DEFAULT_CONFIG };
    }
    this.data[guildId].verification.enabled = enabled;
    await this.save();
  }

  async setCaptchaEnabled(guildId, enabled) {
    if (!this.data[guildId]) {
      this.data[guildId] = { ...DEFAULT_CONFIG };
    }
    this.data[guildId].verification.captcha = enabled;
    await this.save();
  }

  async setRaidDetectionEnabled(guildId, enabled) {
    if (!this.data[guildId]) {
      this.data[guildId] = { ...DEFAULT_CONFIG };
    }
    this.data[guildId].raidDetection.enabled = enabled;
    await this.save();
  }

  async setMaxJoinsPerMinute(guildId, value) {
    if (!this.data[guildId]) {
      this.data[guildId] = { ...DEFAULT_CONFIG };
    }
    this.data[guildId].raidDetection.maxJoinsPerMinute = value;
    await this.save();
  }

  async setLockdownDuration(guildId, minutes) {
    if (!this.data[guildId]) {
      this.data[guildId] = { ...DEFAULT_CONFIG };
    }
    this.data[guildId].raidDetection.lockdownDuration = minutes * 60 * 1000; // Convert minutes to milliseconds
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

  // Raid detection tracking
  recordJoin(guildId) {
    const now = Date.now();
    const key = guildId;
    const joins = this.raidJoins.get(key) || [];
    
    // Remove joins older than 1 minute
    const oneMinuteAgo = now - 60000;
    const recentJoins = joins.filter((time) => time > oneMinuteAgo);
    recentJoins.push(now);
    
    this.raidJoins.set(key, recentJoins);
    return recentJoins.length;
  }

  getJoinCount(guildId) {
    const key = guildId;
    const joins = this.raidJoins.get(key) || [];
    const now = Date.now();
    const oneMinuteAgo = now - 60000;
    
    return joins.filter((time) => time > oneMinuteAgo).length;
  }

  clearJoins(guildId) {
    this.raidJoins.delete(guildId);
  }
}

module.exports = { AntiRaidStore };
