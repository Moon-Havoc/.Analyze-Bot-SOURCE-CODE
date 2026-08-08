const fs = require('node:fs/promises');
const path = require('node:path');

// AutoMod data schema version - increment when breaking changes are made
const AUTOMOD_SCHEMA_VERSION = 1;

const EMPTY_DATA = Object.freeze({
  version: AUTOMOD_SCHEMA_VERSION,
  guilds: {},
});

/**
 * JSON-backed store for AutoMod guild configuration.
 * Stores per-guild settings for enabled filters, actions, logging, and whitelists.
 * 
 * Data persistence:
 * - Uses atomic writes (temporary file + rename) to prevent corruption
 * - Serialized Sets are converted to/from arrays for JSON compatibility
 * - Write queue ensures sequential writes
 * 
 * @example
 * const store = new AutoModStore('./data/automod.json');
 * await store.init();
 * const config = await store.getGuildConfig(guildId);
 */
class AutoModStore {
  constructor(filePath) {
    this.filePath = filePath;
    this.data = null;
    this.initializing = null;
    this.writeQueue = Promise.resolve();
  }

  async init() {
    if (this.data) return;
    if (this.initializing) return this.initializing;

    this.initializing = (async () => {
      await fs.mkdir(path.dirname(this.filePath), { recursive: true });

      try {
        const raw = await fs.readFile(this.filePath, 'utf8');
        this.data = this.#validate(JSON.parse(raw));
      } catch (error) {
        if (error.code !== 'ENOENT') throw error;
        this.data = structuredClone(EMPTY_DATA);
        await this.#write();
      }
    })();

    try {
      await this.initializing;
    } finally {
      this.initializing = null;
    }
  }

  /**
   * Gets the AutoMod configuration for a guild.
   * Returns default config if guild has no saved configuration.
   * @param {string} guildId - Discord guild ID
   * @returns {Promise<object>} Guild configuration object
   */
  async getGuildConfig(guildId) {
    await this.init();
    return this.data.guilds[guildId] ?? this.#defaultGuildConfig();
  }

  /**
   * Sets the complete AutoMod configuration for a guild.
   * Merges provided config with defaults to ensure all fields exist.
   * @param {string} guildId - Discord guild ID
   * @param {object} config - Configuration object to set
   * @returns {Promise<object>} Updated configuration
   */
  async setGuildConfig(guildId, config) {
    return this.#mutate((data) => {
      data.guilds[guildId] = { ...this.#defaultGuildConfig(), ...config, updatedAt: new Date().toISOString() };
      return data.guilds[guildId];
    });
  }

  /**
   * Updates specific fields in a guild's AutoMod configuration.
   * Preserves existing fields not specified in updates.
   * @param {string} guildId - Discord guild ID
   * @param {object} updates - Partial configuration to update
   * @returns {Promise<object>} Updated configuration
   */
  async updateGuildConfig(guildId, updates) {
    return this.#mutate((data) => {
      const existing = data.guilds[guildId] ?? this.#defaultGuildConfig();
      data.guilds[guildId] = { ...existing, ...updates, updatedAt: new Date().toISOString() };
      return data.guilds[guildId];
    });
  }

  /**
   * Enables or disables a specific filter for a guild.
   * @param {string} guildId - Discord guild ID
   * @param {string} filterId - Filter identifier
   * @param {boolean} enabled - Whether to enable the filter
   * @returns {Promise<object>} Updated configuration
   */
  async setFilterEnabled(guildId, filterId, enabled) {
    return this.#mutate((data) => {
      const config = data.guilds[guildId] ?? this.#defaultGuildConfig();
      if (enabled) {
        config.enabledFilters.add(filterId);
      } else {
        config.enabledFilters.delete(filterId);
      }
      data.guilds[guildId] = config;
      return config;
    });
  }

  /**
   * Sets configuration options for a specific filter.
   * @param {string} guildId - Discord guild ID
   * @param {string} filterId - Filter identifier
   * @param {object} filterConfig - Filter-specific configuration
   * @returns {Promise<object>} Updated configuration
   */
  async setFilterConfig(guildId, filterId, filterConfig) {
    return this.#mutate((data) => {
      const config = data.guilds[guildId] ?? this.#defaultGuildConfig();
      config.filterConfigs[filterId] = filterConfig;
      data.guilds[guildId] = config;
      return config;
    });
  }

  /**
   * Adds a role to the ignore list for a guild.
   * Members with this role will bypass AutoMod checks.
   * @param {string} guildId - Discord guild ID
   * @param {string} roleId - Discord role ID
   * @returns {Promise<object>} Updated configuration
   */
  async addIgnoredRole(guildId, roleId) {
    return this.#mutate((data) => {
      const config = data.guilds[guildId] ?? this.#defaultGuildConfig();
      config.ignoredRoles.add(roleId);
      data.guilds[guildId] = config;
      return config;
    });
  }

  /**
   * Removes a role from the ignore list for a guild.
   * @param {string} guildId - Discord guild ID
   * @param {string} roleId - Discord role ID
   * @returns {Promise<object>} Updated configuration
   */
  async removeIgnoredRole(guildId, roleId) {
    return this.#mutate((data) => {
      const config = data.guilds[guildId] ?? this.#defaultGuildConfig();
      config.ignoredRoles.delete(roleId);
      data.guilds[guildId] = config;
      return config;
    });
  }

  /**
   * Adds a channel to the ignore list for a guild.
   * Messages in this channel will bypass AutoMod checks.
   * @param {string} guildId - Discord guild ID
   * @param {string} channelId - Discord channel ID
   * @returns {Promise<object>} Updated configuration
   */
  async addIgnoredChannel(guildId, channelId) {
    return this.#mutate((data) => {
      const config = data.guilds[guildId] ?? this.#defaultGuildConfig();
      config.ignoredChannels.add(channelId);
      data.guilds[guildId] = config;
      return config;
    });
  }

  /**
   * Removes a channel from the ignore list for a guild.
   * @param {string} guildId - Discord guild ID
   * @param {string} channelId - Discord channel ID
   * @returns {Promise<object>} Updated configuration
   */
  async removeIgnoredChannel(guildId, channelId) {
    return this.#mutate((data) => {
      const config = data.guilds[guildId] ?? this.#defaultGuildConfig();
      config.ignoredChannels.delete(channelId);
      data.guilds[guildId] = config;
      return config;
    });
  }

  /**
   * Sets the log channel for AutoMod events.
   * @param {string} guildId - Discord guild ID
   * @param {string|null} channelId - Discord channel ID, or null to disable logging
   * @returns {Promise<object>} Updated configuration
   */
  async setLogChannel(guildId, channelId) {
    return this.#mutate((data) => {
      const config = data.guilds[guildId] ?? this.#defaultGuildConfig();
      config.logChannelId = channelId;
      data.guilds[guildId] = config;
      return config;
    });
  }

  /**
   * Sets configuration for a specific action type.
   * @param {string} guildId - Discord guild ID
   * @param {string} actionType - Action type ('delete', 'warn', 'timeout', 'kick', 'ban')
   * @param {object} actionConfig - Action configuration
   * @returns {Promise<object>} Updated configuration
   */
  async setAction(guildId, actionType, actionConfig) {
    return this.#mutate((data) => {
      const config = data.guilds[guildId] ?? this.#defaultGuildConfig();
      config.actions[actionType] = actionConfig;
      data.guilds[guildId] = config;
      return config;
    });
  }

  /**
   * Adds a domain to the anti-link whitelist for a guild.
   * @param {string} guildId - Discord guild ID
   * @param {string} domain - Domain to whitelist (e.g., 'example.com')
   * @returns {Promise<object>} Updated configuration
   */
  async addWhitelistedDomain(guildId, domain) {
    return this.#mutate((data) => {
      const config = data.guilds[guildId] ?? this.#defaultGuildConfig();
      if (!config.filterConfigs['anti-link']) {
        config.filterConfigs['anti-link'] = { allowWhitelistedDomains: new Set() };
      }
      if (!config.filterConfigs['anti-link'].allowWhitelistedDomains) {
        config.filterConfigs['anti-link'].allowWhitelistedDomains = new Set();
      }
      config.filterConfigs['anti-link'].allowWhitelistedDomains.add(domain.toLowerCase());
      data.guilds[guildId] = config;
      return config;
    });
  }

  /**
   * Removes a domain from the anti-link whitelist for a guild.
   * @param {string} guildId - Discord guild ID
   * @param {string} domain - Domain to remove from whitelist
   * @returns {Promise<object>} Updated configuration
   */
  async removeWhitelistedDomain(guildId, domain) {
    return this.#mutate((data) => {
      const config = data.guilds[guildId] ?? this.#defaultGuildConfig();
      if (config.filterConfigs['anti-link']?.allowWhitelistedDomains) {
        config.filterConfigs['anti-link'].allowWhitelistedDomains.delete(domain.toLowerCase());
      }
      data.guilds[guildId] = config;
      return config;
    });
  }

  /**
   * Returns the default configuration for a guild.
   * Used when a guild has no saved configuration.
   * @returns {object} Default guild configuration
   */
  #defaultGuildConfig() {
    return {
      enabled: false,
      enabledFilters: new Set(),
      filterConfigs: {},
      ignoredRoles: new Set(),
      ignoredChannels: new Set(),
      logChannelId: null,
      actions: {
        delete: false,
        warn: false,
        timeout: { enabled: false, duration: null },
        kick: false,
        ban: false,
      },
      updatedAt: new Date().toISOString(),
    };
  }

  /**
   * Executes a mutation operation with queued writes.
   * Ensures writes are serialized and atomic.
   * @param {Function} mutator - Function that mutates data and returns result
   * @returns {Promise<any>} Result from mutator function
   */
  async #mutate(mutator) {
    await this.init();

    const operation = this.writeQueue
      .catch(() => undefined)
      .then(async () => {
        const result = mutator(this.data);
        await this.#write();
        return result;
      });

    // Keep queue usable after failed writes while still propagating errors
    this.writeQueue = operation.then(
      () => undefined,
      () => undefined,
    );
    return operation;
  }

  /**
   * Atomically writes data to disk.
   * Uses temporary file + rename pattern to prevent corruption.
   * Sets are serialized to arrays for JSON compatibility.
   */
  async #write() {
    const temporaryPath = `${this.filePath}.${process.pid}.tmp`;
    const serialized = JSON.stringify(this.data, (key, value) => {
      if (value instanceof Set) return Array.from(value);
      return value;
    }, 2);
    await fs.writeFile(temporaryPath, `${serialized}\n`, 'utf8');
    await fs.rename(temporaryPath, this.filePath);
  }

  /**
   * Validates and sanitizes loaded data.
   * Ensures data structure matches expected schema.
   * @param {any} value - Parsed JSON value to validate
   * @returns {object} Validated data object
   * @throws {Error} If data is invalid
   */
  #validate(value) {
    if (!value || typeof value !== 'object') {
      throw new Error('AutoMod data must be a JSON object.');
    }

    const guilds = this.#objectOrEmpty(value.guilds);
    for (const [guildId, config] of Object.entries(guilds)) {
      // Validate filterConfigs and convert arrays to Sets where needed
      const filterConfigs = this.#objectOrEmpty(config.filterConfigs);
      for (const [filterId, filterConfig] of Object.entries(filterConfigs)) {
        if (filterConfig.allowWhitelistedDomains && Array.isArray(filterConfig.allowWhitelistedDomains)) {
          filterConfig.allowWhitelistedDomains = new Set(filterConfig.allowWhitelistedDomains);
        }
      }

      guilds[guildId] = {
        enabled: Boolean(config.enabled),
        enabledFilters: new Set(Array.isArray(config.enabledFilters) ? config.enabledFilters : []),
        filterConfigs,
        ignoredRoles: new Set(Array.isArray(config.ignoredRoles) ? config.ignoredRoles : []),
        ignoredChannels: new Set(Array.isArray(config.ignoredChannels) ? config.ignoredChannels : []),
        logChannelId: config.logChannelId || null,
        actions: this.#objectOrEmpty(config.actions),
        updatedAt: config.updatedAt || new Date().toISOString(),
      };
    }

    return {
      version: AUTOMOD_SCHEMA_VERSION,
      guilds,
    };
  }

  /**
   * Returns value if it's a plain object, otherwise returns empty object.
   * @param {any} value - Value to check
   * @returns {object} Plain object or empty object
   */
  #objectOrEmpty(value) {
    return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  }
}

module.exports = { AutoModStore };
