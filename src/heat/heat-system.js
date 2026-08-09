/**
 * Heat System
 * Adaptive spam detection algorithm inspired by Wick
 * Heat accumulates based on message activity and diminishes over time
 */

class HeatSystem {
  constructor() {
    this.userHeat = new Map(); // userId -> { heat, lastUpdate, violations }
    this.decayRate = 0.95; // Heat decay per second
    this.baseHeatIncrease = 10; // Base heat increase per message
    this.heatThreshold = 100; // Threshold to trigger action
    this.maxHeat = 200; // Maximum heat cap
  }

  /**
   * Process a message and update heat
   */
  processMessage(userId, guildId, message) {
    const key = `${guildId}:${userId}`;
    const now = Date.now();
    const userData = this.userHeat.get(key) || { heat: 0, lastUpdate: now, violations: 0 };

    // Calculate time elapsed since last update
    const elapsed = (now - userData.lastUpdate) / 1000; // in seconds

    // Decay heat over time
    userData.heat = Math.max(0, userData.heat * Math.pow(this.decayRate, elapsed));

    // Calculate heat increase based on message content
    const heatIncrease = this.calculateHeatIncrease(message);

    // Add heat
    userData.heat = Math.min(this.maxHeat, userData.heat + heatIncrease);
    userData.lastUpdate = now;

    // Check if threshold exceeded
    const triggered = userData.heat >= this.heatThreshold;
    if (triggered) {
      userData.violations++;
      userData.heat = 0; // Reset heat after triggering
    }

    this.userHeat.set(key, userData);

    return {
      heat: userData.heat,
      triggered,
      violations: userData.violations,
      reason: triggered ? this.getTriggerReason(message) : null,
    };
  }

  /**
   * Calculate heat increase based on message content
   */
  calculateHeatIncrease(message) {
    let heat = this.baseHeatIncrease;
    const content = message.content || '';

    // Check for repeated characters
    if (/(.)\1{4,}/.test(content)) {
      heat += 20;
    }

    // Check for excessive caps
    const capsRatio = (content.match(/[A-Z]/g) || []).length / Math.max(1, content.length);
    if (capsRatio > 0.7 && content.length > 10) {
      heat += 15;
    }

    // Check for excessive mentions
    const mentionCount = (content.match(/<@/g) || []).length;
    if (mentionCount > 3) {
      heat += 10 * mentionCount;
    }

    // Check for excessive emojis
    const emojiCount = (content.match(/[\u{1F300}-\u{1F9FF}]/gu) || []).length;
    if (emojiCount > 5) {
      heat += 5 * emojiCount;
    }

    // Check for excessive newlines
    const newlineCount = (content.match(/\n/g) || []).length;
    if (newlineCount > 5) {
      heat += 5 * newlineCount;
    }

    // Check for repeated words
    const words = content.toLowerCase().split(/\s+/);
    const wordCounts = {};
    for (const word of words) {
      wordCounts[word] = (wordCounts[word] || 0) + 1;
    }
    const maxWordCount = Math.max(...Object.values(wordCounts));
    if (maxWordCount > 3) {
      heat += 10 * maxWordCount;
    }

    // Check for links
    if (/https?:\/\/\S+/.test(content)) {
      heat += 5;
    }

    // Check for message length (very long messages)
    if (content.length > 500) {
      heat += 10;
    }

    // Check for rapid fire (messages sent very quickly)
    const userData = this.userHeat.get(`${message.guildId}:${message.author.id}`);
    if (userData && (Date.now() - userData.lastUpdate) < 1000) {
      heat += 15; // Bonus heat for rapid messages
    }

    return heat;
  }

  /**
   * Get trigger reason based on message content
   */
  getTriggerReason(message) {
    const content = message.content || '';
    const reasons = [];

    if (/(.)\1{4,}/.test(content)) reasons.push('Repeated characters');
    const capsRatio = (content.match(/[A-Z]/g) || []).length / Math.max(1, content.length);
    if (capsRatio > 0.7 && content.length > 10) reasons.push('Excessive caps');
    const mentionCount = (content.match(/<@/g) || []).length;
    if (mentionCount > 3) reasons.push('Excessive mentions');
    const emojiCount = (content.match(/[\u{1F300}-\u{1F9FF}]/gu) || []).length;
    if (emojiCount > 5) reasons.push('Excessive emojis');
    const newlineCount = (content.match(/\n/g) || []).length;
    if (newlineCount > 5) reasons.push('Excessive newlines');
    if (/https?:\/\/\S+/.test(content)) reasons.push('Contains links');
    if (content.length > 500) reasons.push('Very long message');

    return reasons.length > 0 ? reasons.join(', ') : 'High activity detected';
  }

  /**
   * Get current heat for a user
   */
  getHeat(userId, guildId) {
    const key = `${guildId}:${userId}`;
    const userData = this.userHeat.get(key);
    if (!userData) return 0;

    // Decay heat before returning
    const now = Date.now();
    const elapsed = (now - userData.lastUpdate) / 1000;
    return Math.max(0, userData.heat * Math.pow(this.decayRate, elapsed));
  }

  /**
   * Reset heat for a user
   */
  resetHeat(userId, guildId) {
    const key = `${guildId}:${userId}`;
    this.userHeat.delete(key);
  }

  /**
   * Clean up old heat data
   */
  cleanup() {
    const now = Date.now();
    const oneHourAgo = now - 3600000;

    for (const [key, userData] of this.userHeat.entries()) {
      if (userData.lastUpdate < oneHourAgo) {
        this.userHeat.delete(key);
      }
    }
  }

  /**
   * Set configuration
   */
  setConfig(config) {
    if (config.decayRate) this.decayRate = config.decayRate;
    if (config.baseHeatIncrease) this.baseHeatIncrease = config.baseHeatIncrease;
    if (config.heatThreshold) this.heatThreshold = config.heatThreshold;
    if (config.maxHeat) this.maxHeat = config.maxHeat;
  }
}

module.exports = { HeatSystem };
