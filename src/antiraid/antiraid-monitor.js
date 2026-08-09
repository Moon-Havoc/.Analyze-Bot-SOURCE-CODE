/**
 * Anti-Raid Monitor
 * Monitors guild joins and applies join gate rules
 */

class AntiRaidMonitor {
  constructor(store, client) {
    this.store = store;
    this.client = client;
    this.lockdowns = new Map(); // Track active lockdowns
  }

  /**
   * Process a new member join
   */
  async processMemberJoin(member) {
    const config = await this.store.getGuildConfig(member.guild.id);
    if (!config.enabled) return;

    // Check if user is whitelisted
    if (await this.store.isUserWhitelisted(member.guild.id, member.id)) {
      return;
    }

    // Check if user has whitelisted role
    if (await this.store.hasWhitelistedRole(member.guild.id, Array.from(member.roles.cache.keys()))) {
      return;
    }

    // Apply join gate rules
    if (config.joinGate.enabled) {
      const blocked = await this.checkJoinGate(member, config.joinGate);
      if (blocked) {
        await this.handleBlockedMember(member, blocked.reason);
        return;
      }
    }

    // Check for raid
    if (config.raidDetection.enabled) {
      const joinCount = this.store.recordJoin(member.guild.id);
      const maxJoins = config.raidDetection.maxJoinsPerMinute;

      console.log(`[Anti-Raid] Join count for ${member.guild.id}: ${joinCount}/${maxJoins}`);

      if (joinCount >= maxJoins) {
        console.log(`[Anti-Raid] Raid detected in ${member.guild.id}`);
        await this.triggerRaidLockdown(member.guild, config);
      }
    }
  }

  /**
   * Check if member passes join gate
   */
  async checkJoinGate(member, config) {
    const user = member.user;

    // Check account age
    if (config.minAccountAge > 0) {
      const accountAge = Date.now() - user.createdTimestamp;
      if (accountAge < config.minAccountAge) {
        const hours = Math.floor(config.minAccountAge / (60 * 60 * 1000));
        return { reason: `Account too new (must be ${hours}+ hours old)` };
      }
    }

    // Check for avatar
    if (config.requireAvatar && !user.avatar) {
      return { reason: 'No avatar' };
    }

    // Check for invite in username
    if (config.blockInviteInUsername) {
      const invitePattern = /discord\.(gg|io|com|me)\/[a-zA-Z0-9]+/i;
      if (invitePattern.test(user.username)) {
        return { reason: 'Invite link in username' };
      }
    }

    // Check for unverified bots
    if (config.blockUnverifiedBots && user.bot && !user.flags?.has('VerifiedBot')) {
      return { reason: 'Unverified bot' };
    }

    // Suspicious detection (heuristic)
    if (config.suspiciousDetection) {
      const suspicious = await this.checkSuspicious(user);
      if (suspicious) {
        return { reason: 'Suspicious account detected' };
      }
    }

    return null;
  }

  /**
   * Check for suspicious account patterns
   */
  async checkSuspicious(user) {
    // Check for default avatar
    if (!user.avatar) {
      return true;
    }

    // Check for very new account (less than 1 day)
    const accountAge = Date.now() - user.createdTimestamp;
    if (accountAge < 86400000) {
      return true;
    }

    // Check for random username pattern (many numbers)
    const numberCount = (user.username.match(/\d/g) || []).length;
    if (numberCount > 5) {
      return true;
    }

    return false;
  }

  /**
   * Handle a blocked member
   */
  async handleBlockedMember(member, reason) {
    console.log(`[Anti-Raid] Blocking ${member.id} in ${member.guild.id} (reason: ${reason})`);

    try {
      // Kick the member
      await member.kick(`Anti-Raid: ${reason}`);
      console.log(`[Anti-Raid] Kicked ${member.id} from ${member.guild.id}`);
    } catch (error) {
      console.error(`[Anti-Raid] Failed to kick ${member.id}:`, error.message);
    }
  }

  /**
   * Trigger raid lockdown
   */
  async triggerRaidLockdown(guild, config) {
    console.log(`[Anti-Raid] Triggering lockdown for ${guild.id}`);

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
          console.error(`[Anti-Raid] Failed to lock channel ${channel.id}:`, error.message);
        }
      }
    }

    // Set lockdown timer
    const lockdownDuration = config.raidDetection.lockdownDuration;
    this.lockdowns.set(guild.id, Date.now() + lockdownDuration);

    console.log(`[Anti-Raid] Lockdown active for ${lockdownDuration / 60000} minutes`);

    // Schedule lockdown lift
    setTimeout(() => {
      this.liftLockdown(guild);
    }, lockdownDuration);
  }

  /**
   * Lift raid lockdown
   */
  async liftLockdown(guild) {
    console.log(`[Anti-Raid] Lifting lockdown for ${guild.id}`);

    // Unlock all text channels
    const everyoneRole = guild.roles.everyone;
    const channels = await guild.channels.fetch();

    for (const [_, channel] of channels) {
      if (channel.isTextBased()) {
        try {
          await channel.permissionOverwrites.edit(everyoneRole, {
            SendMessages: null,
            CreateThreads: null,
            SendMessagesInThreads: null,
          });
        } catch (error) {
          console.error(`[Anti-Raid] Failed to unlock channel ${channel.id}:`, error.message);
        }
      }
    }

    this.lockdowns.delete(guild.id);
    this.store.clearJoins(guild.id);

    console.log(`[Anti-Raid] Lockdown lifted for ${guild.id}`);
  }

  /**
   * Check if guild is in lockdown
   */
  isLockdownActive(guildId) {
    const endTime = this.lockdowns.get(guildId);
    if (!endTime) return false;
    
    if (Date.now() > endTime) {
      this.lockdowns.delete(guildId);
      return false;
    }
    
    return true;
  }
}

module.exports = { AntiRaidMonitor };
