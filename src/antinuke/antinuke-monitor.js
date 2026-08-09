const { AuditLogEvent } = require('discord.js');

/**
 * Anti-Nuke Monitor
 * Monitors guild audit logs for suspicious activity and triggers quarantine/panic mode
 */

class AntiNukeMonitor {
  constructor(store, client) {
    this.store = store;
    this.client = client;
    this.actionCounts = new Map(); // Track action counts per user per guild
    this.timeWindow = 10000; // 10 seconds window for detection
  }

  /**
   * Initialize audit log monitoring for a guild
   */
  async initGuild(guild) {
    const config = await this.store.getGuildConfig(guild.id);
    if (!config.enabled) return;

    console.log(`[Anti-Nuke] Initialized for guild ${guild.id}`);
  }

  /**
   * Process an audit log entry
   */
  async processAuditLogEntry(entry, guild) {
    const config = await this.store.getGuildConfig(guild.id);
    if (!config.enabled) return;

    // Check if user is whitelisted
    if (await this.store.isUserWhitelisted(guild.id, entry.executorId)) {
      return;
    }

    // Check if user has whitelisted role
    const executor = await guild.members.fetch(entry.executorId).catch(() => null);
    if (executor && await this.store.hasWhitelistedRole(guild.id, Array.from(executor.roles.cache.keys()))) {
      return;
    }

    // Check if executor is the bot itself
    if (entry.executorId === this.client.user.id) {
      return;
    }

    // Check if executor is the guild owner
    if (entry.executorId === guild.ownerId) {
      return;
    }

    // Process based on action type
    switch (entry.action) {
      case AuditLogEvent.MemberBanAdd:
        await this.handleMassAction(guild, entry.executorId, 'massBan', config);
        break;
      case AuditLogEvent.MemberKick:
        await this.handleMassAction(guild, entry.executorId, 'massKick', config);
        break;
      case AuditLogEvent.ChannelDelete:
        await this.handleMassAction(guild, entry.executorId, 'massDelete', config);
        break;
      case AuditLogEvent.ChannelCreate:
        await this.handleMassAction(guild, entry.executorId, 'massCreate', config);
        break;
      case AuditLogEvent.RoleDelete:
        await this.handleMassAction(guild, entry.executorId, 'massRoleDelete', config);
        break;
      case AuditLogEvent.RoleCreate:
        await this.handleMassAction(guild, entry.executorId, 'massRoleCreate', config);
        break;
      case AuditLogEvent.RoleUpdate:
        await this.handleRoleUpdate(guild, entry, config);
        break;
    }
  }

  /**
   * Handle mass actions (bans, kicks, deletions, creations)
   */
  async handleMassAction(guild, executorId, actionType, config) {
    const threshold = config.thresholds[actionType];
    const key = `${guild.id}:${executorId}:${actionType}`;

    // Get current count
    const now = Date.now();
    const countData = this.actionCounts.get(key) || { count: 0, resetTime: now + this.timeWindow };

    // Reset if time window passed
    if (now > countData.resetTime) {
      countData.count = 0;
      countData.resetTime = now + this.timeWindow;
    }

    countData.count++;
    this.actionCounts.set(key, countData);

    console.log(`[Anti-Nuke] ${actionType}: ${countData.count}/${threshold} by ${executorId} in ${guild.id}`);

    // Check if threshold exceeded
    if (countData.count >= threshold) {
      console.log(`[Anti-Nuke] Threshold exceeded for ${actionType} by ${executorId} in ${guild.id}`);
      await this.triggerQuarantine(guild, executorId, actionType, config);
      this.actionCounts.delete(key);
    }
  }

  /**
   * Handle role updates (dangerous permission additions)
   */
  async handleRoleUpdate(guild, entry, config) {
    const changes = entry.changes;
    if (!changes || changes.length === 0) return;

    const dangerousPerms = config.dangerousPermissions;
    const executor = await guild.members.fetch(entry.executorId).catch(() => null);
    if (!executor) return;

    // Check if dangerous permissions were added
    for (const change of changes) {
      if (change.key === '$add' || change.key === 'permissions') {
        const addedPerms = change.new || [];
        const hasDangerous = addedPerms.some((perm) => {
          if (typeof perm === 'string') {
            return dangerousPerms.includes(perm);
          }
          return dangerousPerms.some((dangerous) => perm.toString().includes(dangerous));
        });

        if (hasDangerous) {
          console.log(`[Anti-Nuke] Dangerous permissions added to role by ${executorId} in ${guild.id}`);
          await this.triggerQuarantine(guild, entry.executorId, 'dangerous_permissions', config);
          return;
        }
      }
    }
  }

  /**
   * Trigger quarantine for a user
   */
  async triggerQuarantine(guild, executorId, reason, config) {
    console.log(`[Anti-Nuke] Triggering quarantine for ${executorId} in ${guild.id} (reason: ${reason})`);

    const executor = await guild.members.fetch(executorId).catch(() => null);
    if (!executor) {
      console.log(`[Anti-Nuke] Could not fetch executor ${executorId}`);
      return;
    }

    // If quarantine role is set, apply it
    if (config.quarantineRoleId) {
      const quarantineRole = await guild.roles.fetch(config.quarantineRoleId).catch(() => null);
      if (quarantineRole) {
        try {
          // Remove all other roles and add quarantine role
          await executor.roles.set([quarantineRole], 'Anti-Nuke: Suspicious activity detected');
          console.log(`[Anti-Nuke] Quarantined ${executorId} in ${guild.id}`);
        } catch (error) {
          console.error(`[Anti-Nuke] Failed to quarantine ${executorId}:`, error.message);
        }
      }
    } else {
      // If no quarantine role, kick the user
      try {
        await executor.kick('Anti-Nuke: Suspicious activity detected');
        console.log(`[Anti-Nuke] Kicked ${executorId} in ${guild.id}`);
      } catch (error) {
        console.error(`[Anti-Nuke] Failed to kick ${executorId}:`, error.message);
      }
    }

    // Trigger panic mode if configured
    if (config.panicMode) {
      await this.triggerPanicMode(guild, reason);
    }

    // Log to audit channel if configured
    // This would integrate with your existing audit log system
  }

  /**
   * Trigger panic mode (lockdown)
   */
  async triggerPanicMode(guild, reason) {
    console.log(`[Anti-Nuke] Triggering panic mode for ${guild.id} (reason: ${reason})`);

    // Lock down all text channels
    const everyoneRole = guild.roles.everyone;
    const channels = await guild.channels.fetch();

    for (const [_, channel] of channels) {
      if (channel.isTextBased()) {
        try {
          await channel.permissionOverwrites.edit(everyoneRole, {
            SendMessages: false,
            CreateThreads: false,
            SendMessagesInThreads: false,
          });
        } catch (error) {
          console.error(`[Anti-Nuke] Failed to lock channel ${channel.id}:`, error.message);
        }
      }
    }

    console.log(`[Anti-Nuke] Panic mode activated for ${guild.id}`);
  }

  /**
   * Clean up old action counts
   */
  cleanup() {
    const now = Date.now();
    for (const [key, data] of this.actionCounts.entries()) {
      if (now > data.resetTime) {
        this.actionCounts.delete(key);
      }
    }
  }
}

module.exports = { AntiNukeMonitor };
