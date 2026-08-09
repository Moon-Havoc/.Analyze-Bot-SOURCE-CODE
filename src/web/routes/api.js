const express = require('express');
const router = express.Router();
const { isAuthenticated, hasGuildPermission } = require('../auth');

/**
 * API Routes for Dashboard
 * These will be connected to the bot's stores and systems
 */

// Get user's guilds where bot is present
router.get('/guilds', isAuthenticated, (req, res) => {
  const userGuilds = req.user?.guilds || [];
  
  // Filter to only guilds where bot is present
  // For now, we'll return all guilds
  // In production, you'd check against the bot's guild list
  
  res.json({ guilds: userGuilds });
});

// Get guild automod configuration
router.get('/guilds/:guildId/config', isAuthenticated, hasGuildPermission, (req, res) => {
  // This will connect to the AutoModStore
  // For now, return placeholder data
  res.json({
    guildId: req.params.guildId,
    config: {
      enabled: false,
      logChannelId: null,
      ignoredChannels: [],
      ignoredRoles: [],
      enabledFilters: [],
      filterConfigs: {},
      actions: {
        delete: false,
        warn: false,
        timeout: { enabled: false, duration: 60000 },
        kick: false,
        ban: false,
      },
    },
  });
});

// Update guild automod configuration
router.put('/guilds/:guildId/config', isAuthenticated, hasGuildPermission, (req, res) => {
  // This will update the AutoModStore
  // For now, return success
  res.json({ success: true, message: 'Configuration updated' });
});

// Get guild audit logs
router.get('/guilds/:guildId/logs', isAuthenticated, hasGuildPermission, (req, res) => {
  // This will fetch from the audit log system
  // For now, return placeholder data
  res.json({
    guildId: req.params.guildId,
    logs: [],
    total: 0,
  });
});

// Get guild statistics
router.get('/guilds/:guildId/stats', isAuthenticated, hasGuildPermission, (req, res) => {
  // This will fetch from the statistics system
  // For now, return placeholder data
  res.json({
    guildId: req.params.guildId,
    stats: {
      messagesFiltered: 0,
      usersActioned: 0,
      raidsStopped: 0,
      nukesPrevented: 0,
    },
  });
});

// Anti-Nuke configuration
router.get('/guilds/:guildId/antinuke', isAuthenticated, hasGuildPermission, (req, res) => {
  res.json({
    guildId: req.params.guildId,
    config: {
      enabled: false,
      quarantineRoleId: null,
      panicMode: false,
      thresholds: {
        massBan: 5,
        massKick: 10,
        massDelete: 5,
        massCreate: 5,
      },
    },
  });
});

// Anti-Raid configuration
router.get('/guilds/:guildId/antiraid', isAuthenticated, hasGuildPermission, (req, res) => {
  res.json({
    guildId: req.params.guildId,
    config: {
      enabled: false,
      joinGate: {
        enabled: false,
        minAccountAge: 0,
        requireAvatar: false,
        suspiciousDetection: false,
      },
      verification: {
        enabled: false,
        captcha: false,
      },
    },
  });
});

module.exports = router;
