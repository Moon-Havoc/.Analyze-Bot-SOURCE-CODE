/**
 * Spam Filter
 * Detects and blocks various types of spam messages.
 * 
 * Filter interface:
 * - id: Unique identifier for the filter
 * - displayName: Human-readable name for UI
 * - defaultConfig: Default configuration options for this filter
 * - check: Async function that evaluates messages
 * 
 * @returns {{triggered: boolean, reason?: string, spamType?: string, details?: object}}
 */

// Emoji pattern for detection
const EMOJI_PATTERN = /[\p{Emoji_Presentation}\p{Extended_Pictographic}]/gu;

/**
 * Calculates Levenshtein distance between two strings.
 * Used for near-duplicate detection.
 * @param {string} a - First string
 * @param {string} b - Second string
 * @returns {number} Edit distance
 */
function levenshteinDistance(a, b) {
  const m = a.length;
  const n = b.length;
  const dp = new Array(m + 1).fill(null).map(() => new Array(n + 1).fill(0));

  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (a[i - 1] === b[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1];
      } else {
        dp[i][j] = 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
      }
    }
  }

  return dp[m][n];
}

/**
 * Calculates similarity ratio between two strings (0-1).
 * @param {string} a - First string
 * @param {string} b - Second string
 * @returns {number} Similarity ratio
 */
function similarityRatio(a, b) {
  const maxLen = Math.max(a.length, b.length);
  if (maxLen === 0) return 1;
  const distance = levenshteinDistance(a, b);
  return 1 - distance / maxLen;
}

/**
 * Counts consecutive repeated characters.
 * @param {string} str - String to check
 * @returns {number} Maximum consecutive character count
 */
function maxConsecutiveChars(str) {
  if (!str) return 0;
  let maxCount = 1;
  let currentCount = 1;
  for (let i = 1; i < str.length; i++) {
    if (str[i] === str[i - 1]) {
      currentCount++;
      maxCount = Math.max(maxCount, currentCount);
    } else {
      currentCount = 1;
    }
  }
  return maxCount;
}

/**
 * Counts emojis in a string.
 * @param {string} str - String to check
 * @returns {number} Emoji count
 */
function countEmojis(str) {
  const matches = str.match(EMOJI_PATTERN);
  return matches ? matches.length : 0;
}

/**
 * Counts lines in a string.
 * @param {string} str - String to check
 * @returns {number} Line count
 */
function countLines(str) {
  return str.split('\n').filter(line => line.trim().length > 0).length;
}

/**
 * Counts word repetitions in a string.
 * @param {string} str - String to check
 * @returns {number} Maximum word repetition count
 */
function maxWordRepetition(str) {
  if (!str) return 0;
  const words = str.toLowerCase().split(/\s+/).filter(w => w.length > 2);
  const wordCounts = new Map();
  for (const word of words) {
    wordCounts.set(word, (wordCounts.get(word) || 0) + 1);
  }
  let maxCount = 0;
  for (const count of wordCounts.values()) {
    maxCount = Math.max(maxCount, count);
  }
  return maxCount;
}

const spamFilter = {
  id: 'spam',
  displayName: 'Anti Spam',
  defaultConfig: {
    // Rapid message spam
    maxMessagesPerWindow: 5,
    timeWindowMs: 10000, // 10 seconds
    
    // Duplicate/near-duplicate spam
    maxDuplicateMessages: 3,
    duplicateSimilarityThreshold: 0.85, // 85% similarity
    
    // Character spam
    maxConsecutiveChars: 10,
    
    // Emoji spam
    maxEmojis: 10,
    
    // Line spam
    maxLines: 10,
    
    // Word repetition spam
    maxWordRepetition: 5,
    
    // Bypass options
    ignoreBots: true,
    ignoreAdmins: true,
  },

  /**
   * Checks if a message is spam.
   * @param {Message} message - Discord message object
   * @param {object} config - Filter configuration
   * @param {MessageCache} cache - Message cache instance (passed from engine)
   * @returns {Promise<{triggered: boolean, reason?: string, spamType?: string, details?: object}>}
   */
  async check(message, config, cache) {
    const content = message.content;
    if (!content || content.trim().length === 0) {
      return { triggered: false };
    }

    // Check bot bypass
    if (config.ignoreBots && message.author.bot) {
      return { triggered: false };
    }

    // Check admin bypass
    if (config.ignoreAdmins) {
      try {
        const member = await message.guild.members.fetch(message.author.id).catch(() => null);
        if (member && member.permissions.has('Administrator')) {
          return { triggered: false };
        }
      } catch {
        // If we can't fetch member, proceed without bypass
      }
    }

    // Add message to cache for tracking
    if (cache) {
      cache.add(message.author.id, message.guildId, message.id, content, message.channelId);
    }

    // Check rapid message spam
    const rapidSpamResult = this._checkRapidSpam(message, config, cache);
    if (rapidSpamResult.triggered) {
      return rapidSpamResult;
    }

    // Check duplicate message spam
    const duplicateResult = this._checkDuplicateSpam(message, config, cache);
    if (duplicateResult.triggered) {
      return duplicateResult;
    }

    // Check near-duplicate spam
    const nearDuplicateResult = this._checkNearDuplicateSpam(message, config, cache);
    if (nearDuplicateResult.triggered) {
      return nearDuplicateResult;
    }

    // Check character spam
    const charSpamResult = this._checkCharacterSpam(message, config);
    if (charSpamResult.triggered) {
      return charSpamResult;
    }

    // Check emoji spam
    const emojiSpamResult = this._checkEmojiSpam(message, config);
    if (emojiSpamResult.triggered) {
      return emojiSpamResult;
    }

    // Check line spam
    const lineSpamResult = this._checkLineSpam(message, config);
    if (lineSpamResult.triggered) {
      return lineSpamResult;
    }

    // Check word repetition spam
    const wordRepetitionResult = this._checkWordRepetitionSpam(message, config);
    if (wordRepetitionResult.triggered) {
      return wordRepetitionResult;
    }

    return { triggered: false };
  },

  /**
   * Checks for rapid message spam.
   * @private
   */
  _checkRapidSpam(message, config, cache) {
    if (!cache) return { triggered: false };

    const count = cache.getCountInWindow(
      message.author.id,
      message.guildId,
      config.timeWindowMs || 10000
    );

    const threshold = config.maxMessagesPerWindow || 5;
    if (count > threshold) {
      return {
        triggered: true,
        reason: `Sent ${count} messages in ${config.timeWindowMs / 1000}s (limit: ${threshold})`,
        spamType: 'rapid_spam',
        details: {
          messageCount: count,
          threshold,
          timeWindowMs: config.timeWindowMs,
        },
      };
    }

    return { triggered: false };
  },

  /**
   * Checks for exact duplicate messages.
   * @private
   */
  _checkDuplicateSpam(message, config, cache) {
    if (!cache) return { triggered: false };

    const messages = cache.getAllMessages(message.author.id, message.guildId);
    const content = message.content;
    let duplicateCount = 0;

    for (const entry of messages) {
      if (entry.messageId === message.id) continue; // Skip current message
      if (entry.content === content) {
        duplicateCount++;
      }
    }

    const threshold = config.maxDuplicateMessages || 3;
    if (duplicateCount >= threshold) {
      return {
        triggered: true,
        reason: `Sent duplicate message ${duplicateCount + 1} times (limit: ${threshold})`,
        spamType: 'duplicate_spam',
        details: {
          duplicateCount: duplicateCount + 1,
          threshold,
          content: content.slice(0, 100),
        },
      };
    }

    return { triggered: false };
  },

  /**
   * Checks for near-duplicate messages using similarity ratio.
   * @private
   */
  _checkNearDuplicateSpam(message, config, cache) {
    if (!cache) return { triggered: false };

    const messages = cache.getAllMessages(message.author.id, message.guildId);
    const content = message.content;
    const threshold = config.duplicateSimilarityThreshold || 0.85;
    const maxNearDuplicates = config.maxDuplicateMessages || 3;
    let nearDuplicateCount = 0;

    for (const entry of messages) {
      if (entry.messageId === message.id) continue;
      if (entry.content === content) continue; // Skip exact duplicates (handled separately)

      const similarity = similarityRatio(content, entry.content);
      if (similarity >= threshold) {
        nearDuplicateCount++;
      }
    }

    if (nearDuplicateCount >= maxNearDuplicates) {
      return {
        triggered: true,
        reason: `Sent ${nearDuplicateCount + 1} similar messages (limit: ${maxNearDuplicates})`,
        spamType: 'near_duplicate_spam',
        details: {
          nearDuplicateCount: nearDuplicateCount + 1,
          threshold: maxNearDuplicates,
          similarityThreshold: threshold,
          content: content.slice(0, 100),
        },
      };
    }

    return { triggered: false };
  },

  /**
   * Checks for character repetition spam (e.g., "aaaaaa").
   * @private
   */
  _checkCharacterSpam(message, config) {
    const maxConsecutive = maxConsecutiveChars(message.content);
    const threshold = config.maxConsecutiveChars || 10;

    if (maxConsecutive > threshold) {
      return {
        triggered: true,
        reason: `Character repetition: ${maxConsecutive} consecutive characters (limit: ${threshold})`,
        spamType: 'character_spam',
        details: {
          maxConsecutive,
          threshold,
        },
      };
    }

    return { triggered: false };
  },

  /**
   * Checks for emoji spam.
   * @private
   */
  _checkEmojiSpam(message, config) {
    const emojiCount = countEmojis(message.content);
    const threshold = config.maxEmojis || 10;

    if (emojiCount > threshold) {
      return {
        triggered: true,
        reason: `Emoji spam: ${emojiCount} emojis (limit: ${threshold})`,
        spamType: 'emoji_spam',
        details: {
          emojiCount,
          threshold,
        },
      };
    }

    return { triggered: false };
  },

  /**
   * Checks for line spam.
   * @private
   */
  _checkLineSpam(message, config) {
    const lineCount = countLines(message.content);
    const threshold = config.maxLines || 10;

    if (lineCount > threshold) {
      return {
        triggered: true,
        reason: `Line spam: ${lineCount} lines (limit: ${threshold})`,
        spamType: 'line_spam',
        details: {
          lineCount,
          threshold,
        },
      };
    }

    return { triggered: false };
  },

  /**
   * Checks for word repetition spam.
   * @private
   */
  _checkWordRepetitionSpam(message, config) {
    const maxRepetition = maxWordRepetition(message.content);
    const threshold = config.maxWordRepetition || 5;

    if (maxRepetition > threshold) {
      return {
        triggered: true,
        reason: `Word repetition: word repeated ${maxRepetition} times (limit: ${threshold})`,
        spamType: 'word_repetition_spam',
        details: {
          maxRepetition,
          threshold,
        },
      };
    }

    return { triggered: false };
  },
};

module.exports = { spamFilter };
