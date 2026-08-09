/**
 * AI Moderation Filter (Google Perspective API)
 * Uses AI to detect toxicity, harassment, profanity, and threats.
 * 
 * Filter interface:
 * - id: Unique identifier for the filter
 * - displayName: Human-readable name for UI
 * - defaultConfig: Default configuration options for this filter
 * - check: Async function that evaluates messages
 * 
 * @returns {{triggered: boolean, reason?: string}}
 */

const PERSPECTIVE_API_KEY = process.env.PERSPECTIVE_API_KEY;

const aiModerationFilter = {
  id: 'ai-moderation',
  displayName: 'AI Moderation',
  defaultConfig: {
    enabled: false,
    toxicityThreshold: 0.7,
    harassmentThreshold: 0.7,
    profanityThreshold: 0.8,
    threatThreshold: 0.7,
    insultThreshold: 0.7,
    identityAttackThreshold: 0.7,
  },

  /**
   * Analyzes message using Google Perspective API.
   * @param {Message} message - Discord message object
   * @param {object} config - Filter configuration
   * @param {boolean} config.enabled - Whether the filter is enabled
   * @param {number} config.toxicityThreshold - Threshold for toxicity (0-1)
   * @param {number} config.harassmentThreshold - Threshold for harassment (0-1)
   * @param {number} config.profanityThreshold - Threshold for profanity (0-1)
   * @param {number} config.threatThreshold - Threshold for threats (0-1)
   * @param {number} config.insultThreshold - Threshold for insults (0-1)
   * @param {number} config.identityAttackThreshold - Threshold for identity attacks (0-1)
   * @returns {Promise<{triggered: boolean, reason?: string}>}
   */
  async check(message, config) {
    const { enabled } = config;

    if (!enabled) {
      return { triggered: false };
    }

    if (!PERSPECTIVE_API_KEY) {
      console.warn('[AI Moderation] PERSPECTIVE_API_KEY not configured. Filter disabled.');
      return { triggered: false };
    }

    try {
      const response = await fetch(
        `https://commentanalyzer.googleapis.com/v1alpha1/comments:analyze?key=${PERSPECTIVE_API_KEY}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            comment: {
              text: message.content,
            },
            requestedAttributes: {
              TOXICITY: {},
              SEVERE_TOXICITY: {},
              IDENTITY_ATTACK: {},
              INSULT: {},
              PROFANITY: {},
              THREAT: {},
              SEXUALLY_EXPLICIT: {},
              HARASSMENT: {},
            },
            languages: ['en'],
          }),
        }
      );

      if (!response.ok) {
        console.error('[AI Moderation] API request failed:', response.status, response.statusText);
        return { triggered: false };
      }

      const data = await response.json();
      const attributeScores = data.attributeScores;
      const triggeredCategories = [];

      // Check each category against thresholds
      const categories = [
        { name: 'Toxicity', key: 'TOXICITY', threshold: config.toxicityThreshold },
        { name: 'Harassment', key: 'HARASSMENT', threshold: config.harassmentThreshold },
        { name: 'Profanity', key: 'PROFANITY', threshold: config.profanityThreshold },
        { name: 'Threat', key: 'THREAT', threshold: config.threatThreshold },
        { name: 'Insult', key: 'INSULT', threshold: config.insultThreshold },
        { name: 'Identity Attack', key: 'IDENTITY_ATTACK', threshold: config.identityAttackThreshold },
      ];

      for (const category of categories) {
        const score = attributeScores[category.key]?.summaryScore?.value || 0;
        if (score >= category.threshold) {
          triggeredCategories.push(`${category.name} (${Math.round(score * 100)}%)`);
        }
      }

      if (triggeredCategories.length > 0) {
        return {
          triggered: true,
          reason: `AI detected: ${triggeredCategories.join(', ')}`,
        };
      }

      return { triggered: false };
    } catch (error) {
      console.error('[AI Moderation] Error:', error);
      return { triggered: false };
    }
  },
};

module.exports = { aiModerationFilter };
