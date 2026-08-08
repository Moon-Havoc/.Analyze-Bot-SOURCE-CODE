/**
 * Bad Words Filter
 * Detects and blocks profanity/inappropriate language (placeholder).
 * 
 * Filter interface:
 * - id: Unique identifier for the filter
 * - displayName: Human-readable name for UI
 * - defaultConfig: Default configuration options for this filter
 * - check: Async function that evaluates messages
 * 
 * @returns {{triggered: boolean, reason?: string}}
 */

const badWordsFilter = {
  id: 'bad-words',
  displayName: 'Bad Words',
  defaultConfig: {
    wordList: [],
  },

  /**
   * Checks if a message contains prohibited words.
   * Placeholder implementation - always returns false.
   * @param {Message} message - Discord message object
   * @param {object} config - Filter configuration
   * @param {string[]} config.wordList - List of prohibited words
   * @returns {Promise<{triggered: boolean, reason?: string}>}
   */
  async check(message, config) {
    // Placeholder: full bad word detection logic to be implemented
    return { triggered: false };
  },
};

module.exports = { badWordsFilter };
