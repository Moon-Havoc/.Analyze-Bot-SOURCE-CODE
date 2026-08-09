/**
 * Bad Words Filter
 * Detects and blocks profanity/inappropriate language.
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
    strictMode: false,
  },

  /**
   * Checks if a message contains prohibited words.
   * @param {Message} message - Discord message object
   * @param {object} config - Filter configuration
   * @param {string[]} config.wordList - List of prohibited words
   * @param {boolean} config.strictMode - If true, matches partial words
   * @returns {Promise<{triggered: boolean, reason?: string}>}
   */
  async check(message, config) {
    const { wordList, strictMode } = config;
    
    if (!wordList || wordList.length === 0) {
      return { triggered: false };
    }

    const content = message.content.toLowerCase();
    const foundWords = [];

    for (const word of wordList) {
      const lowerWord = word.toLowerCase();
      
      if (strictMode) {
        // Strict mode: matches partial words (e.g., "bad" matches "badword")
        if (content.includes(lowerWord)) {
          foundWords.push(word);
        }
      } else {
        // Normal mode: matches whole words only (using word boundaries)
        const regex = new RegExp(`\\b${lowerWord}\\b`, 'i');
        if (regex.test(content)) {
          foundWords.push(word);
        }
      }
    }

    if (foundWords.length > 0) {
      return {
        triggered: true,
        reason: `Contains prohibited word(s): ${foundWords.join(', ')}`,
      };
    }

    return { triggered: false };
  },
};

module.exports = { badWordsFilter };
