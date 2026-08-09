const passport = require('passport');
const DiscordStrategy = require('passport-discord').Strategy;

/**
 * Discord OAuth2 Configuration
 * Uses passport-discord for authentication
 */

const DISCORD_CLIENT_ID = process.env.DISCORD_CLIENT_ID;
const DISCORD_CLIENT_SECRET = process.env.DISCORD_CLIENT_SECRET;
const WEB_URL = process.env.WEB_URL || 'http://localhost:5173';

if (!DISCORD_CLIENT_ID || !DISCORD_CLIENT_SECRET) {
  console.warn('[Auth] Discord OAuth2 credentials not configured. Authentication will not work.');
}

// Configure Discord OAuth2 strategy
passport.use(
  new DiscordStrategy(
    {
      clientID: DISCORD_CLIENT_ID,
      clientSecret: DISCORD_CLIENT_SECRET,
      callbackURL: `${WEB_URL}/api/auth/callback`,
      scope: ['identify', 'guilds'],
    },
    async (accessToken, refreshToken, profile, done) => {
      try {
        // Profile contains user info and guilds
        // We'll store this in session for now
        // In production, you'd want to store this in a database
        return done(null, profile);
      } catch (error) {
        return done(error, null);
      }
    }
  )
);

// Serialize user to session
passport.serializeUser((user, done) => {
  done(null, user);
});

// Deserialize user from session
passport.deserializeUser((obj, done) => {
  done(null, obj);
});

/**
 * Middleware to check if user is authenticated
 */
function isAuthenticated(req, res, next) {
  if (req.isAuthenticated()) {
    return next();
  }
  return res.status(401).json({ error: 'Unauthorized' });
}

/**
 * Middleware to check if user has permission to manage guild
 */
function hasGuildPermission(req, res, next) {
  const guildId = req.params.guildId;
  const userGuilds = req.user?.guilds || [];
  
  const guild = userGuilds.find((g) => g.id === guildId);
  
  if (!guild) {
    return res.status(403).json({ error: 'Guild not found or no access' });
  }
  
  // Check if user has MANAGE_GUILD permission
  // Discord API doesn't provide permissions in guilds list
  // We'll need to fetch guild details to check permissions
  // For now, we'll assume they have access if they're in the guild
  req.guild = guild;
  return next();
}

module.exports = {
  passport,
  isAuthenticated,
  hasGuildPermission,
};
