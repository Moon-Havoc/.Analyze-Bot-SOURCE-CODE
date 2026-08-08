/**
 * Message History Cache for Spam Detection
 * Tracks recent messages per user/guild with automatic expiration.
 * 
 * Features:
 * - Per-user message history with timestamps
 * - Automatic expiration of old entries
 * - Efficient lookups for spam detection
 * - Memory-efficient storage with size limits
 */

/**
 * Cache entry for a single message.
 * @typedef {Object} CacheEntry
 * @property {string} content - Message content
 * @property {number} timestamp - Unix timestamp in milliseconds
 * @property {string} channelId - Channel ID where message was sent
 * @property {string} messageId - Discord message ID
 */

/**
 * User-specific message history.
 * @typedef {Object} UserHistory
 * @property {Map<string, CacheEntry>} messages - Map of messageId -> CacheEntry
 * @property {number} lastCleanup - Timestamp of last cleanup
 */

/**
 * Message cache for spam detection.
 */
class MessageCache {
  constructor(maxAgeMs = 60000, maxMessagesPerUser = 100) {
    /** @type {Map<string, UserHistory>} */
    this.users = new Map();
    this.maxAgeMs = maxAgeMs;
    this.maxMessagesPerUser = maxMessagesPerUser;
    this.globalLastCleanup = Date.now();
  }

  /**
   * Adds a message to the cache.
   * @param {string} userId - User ID
   * @param {string} guildId - Guild ID (for composite key)
   * @param {string} messageId - Message ID
   * @param {string} content - Message content
   * @param {string} channelId - Channel ID
   */
  add(userId, guildId, messageId, content, channelId) {
    const key = `${guildId}:${userId}`;
    let history = this.users.get(key);

    if (!history) {
      history = { messages: new Map(), lastCleanup: Date.now() };
      this.users.set(key, history);
    }

    history.messages.set(messageId, {
      content,
      timestamp: Date.now(),
      channelId,
      messageId,
    });

    // Enforce per-user message limit
    if (history.messages.size > this.maxMessagesPerUser) {
      const entries = Array.from(history.messages.entries());
      entries.sort((a, b) => a[1].timestamp - b[1].timestamp);
      const toRemove = entries.slice(0, entries.length - this.maxMessagesPerUser);
      for (const [msgId] of toRemove) {
        history.messages.delete(msgId);
      }
    }

    // Periodic cleanup
    this._cleanupIfNeeded();
  }

  /**
   * Removes a message from the cache.
   * @param {string} userId - User ID
   * @param {string} guildId - Guild ID
   * @param {string} messageId - Message ID
   */
  remove(userId, guildId, messageId) {
    const key = `${guildId}:${userId}`;
    const history = this.users.get(key);
    if (history) {
      history.messages.delete(messageId);
      if (history.messages.size === 0) {
        this.users.delete(key);
      }
    }
  }

  /**
   * Gets all messages for a user within a time window.
   * @param {string} userId - User ID
   * @param {string} guildId - Guild ID
   * @param {number} timeWindowMs - Time window in milliseconds
   * @returns {CacheEntry[]} Messages within the time window
   */
  getMessagesInWindow(userId, guildId, timeWindowMs) {
    const key = `${guildId}:${userId}`;
    const history = this.users.get(key);
    if (!history) return [];

    const now = Date.now();
    const cutoff = now - timeWindowMs;
    const result = [];

    for (const entry of history.messages.values()) {
      if (entry.timestamp >= cutoff) {
        result.push(entry);
      }
    }

    return result;
  }

  /**
   * Gets message count for a user within a time window.
   * @param {string} userId - User ID
   * @param {string} guildId - Guild ID
   * @param {number} timeWindowMs - Time window in milliseconds
   * @returns {number} Message count
   */
  getCountInWindow(userId, guildId, timeWindowMs) {
    return this.getMessagesInWindow(userId, guildId, timeWindowMs).length;
  }

  /**
   * Gets all messages for a user (for duplicate detection).
   * @param {string} userId - User ID
   * @param {string} guildId - Guild ID
   * @returns {CacheEntry[]} All messages for the user
   */
  getAllMessages(userId, guildId) {
    const key = `${guildId}:${userId}`;
    const history = this.users.get(key);
    if (!history) return [];
    return Array.from(history.messages.values());
  }

  /**
   * Cleans up expired entries for a specific user.
   * @param {string} userId - User ID
   * @param {string} guildId - Guild ID
   */
  cleanupUser(userId, guildId) {
    const key = `${guildId}:${userId}`;
    const history = this.users.get(key);
    if (!history) return;

    const now = Date.now();
    const cutoff = now - this.maxAgeMs;

    for (const [msgId, entry] of history.messages.entries()) {
      if (entry.timestamp < cutoff) {
        history.messages.delete(msgId);
      }
    }

    history.lastCleanup = now;

    if (history.messages.size === 0) {
      this.users.delete(key);
    }
  }

  /**
   * Performs global cleanup if needed.
   * @private
   */
  _cleanupIfNeeded() {
    const now = Date.now();
    // Cleanup every 30 seconds
    if (now - this.globalLastCleanup > 30000) {
      this.globalLastCleanup = now;
      const cutoff = now - this.maxAgeMs;

      for (const [key, history] of this.users.entries()) {
        for (const [msgId, entry] of history.messages.entries()) {
          if (entry.timestamp < cutoff) {
            history.messages.delete(msgId);
          }
        }

        if (history.messages.size === 0) {
          this.users.delete(key);
        }
      }
    }
  }

  /**
   * Gets cache statistics for monitoring.
   * @returns {object} Cache statistics
   */
  getStats() {
    let totalMessages = 0;
    for (const history of this.users.values()) {
      totalMessages += history.messages.size;
    }
    return {
      users: this.users.size,
      totalMessages,
      maxAgeMs: this.maxAgeMs,
      maxMessagesPerUser: this.maxMessagesPerUser,
    };
  }

  /**
   * Clears all cache entries (for testing).
   */
  clear() {
    this.users.clear();
    this.globalLastCleanup = Date.now();
  }
}

module.exports = { MessageCache };
