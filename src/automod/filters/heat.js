const { HeatSystem } = require('../../heat/heat-system');

// Global heat system instance
const heatSystem = new HeatSystem();

/**
 * Heat Filter
 * Adaptive spam detection using Wick-inspired heat algorithm
 */

const heatFilter = {
  id: 'heat',
  displayName: 'Heat System',
  description: 'Adaptive spam detection that accumulates heat based on message activity',

  defaultConfig: {
    enabled: false,
    decayRate: 0.95,
    baseHeatIncrease: 10,
    heatThreshold: 100,
    maxHeat: 200,
  },

  /**
   * Check if message triggers heat filter
   */
  async check(message, config, messageCache) {
    if (!config.enabled) {
      return { triggered: false };
    }

    // Update heat system configuration
    heatSystem.setConfig(config);

    // Process message through heat system
    const result = heatSystem.processMessage(message.author.id, message.guildId, message);

    console.log(`[Heat Filter] User ${message.author.id} heat: ${result.heat}/${config.heatThreshold}`);

    if (result.triggered) {
      return {
        triggered: true,
        reason: `Heat threshold exceeded (${result.heat}/${config.heatThreshold}). ${result.reason}`,
        metadata: {
          heat: result.heat,
          violations: result.violations,
        },
      };
    }

    return { triggered: false };
  },
};

module.exports = { heatFilter, heatSystem };
