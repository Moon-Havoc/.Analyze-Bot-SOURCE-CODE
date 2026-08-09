const express = require('express');
const router = express.Router();
const { passport } = require('../auth');

/**
 * Discord OAuth2 Routes
 */

// Redirect to Discord for authentication
router.get('/login', passport.authenticate('discord'));

// Discord OAuth2 callback
router.get(
  '/callback',
  passport.authenticate('discord', {
    failureRedirect: `${process.env.WEB_URL || 'http://localhost:5173'}/login?error=failed`,
  }),
  (req, res) => {
    // Successful authentication
    res.redirect(`${process.env.WEB_URL || 'http://localhost:5173'}/dashboard`);
  }
);

// Logout
router.post('/logout', (req, res, next) => {
  req.logout((err) => {
    if (err) return next(err);
    res.json({ success: true });
  });
});

// Get current user
router.get('/me', (req, res) => {
  if (!req.isAuthenticated()) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  
  res.json({
    user: {
      id: req.user.id,
      username: req.user.username,
      discriminator: req.user.discriminator,
      avatar: req.user.avatar,
      guilds: req.user.guilds,
    },
  });
});

module.exports = router;
