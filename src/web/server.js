const express = require('express');
const session = require('express-session');
const cors = require('cors');
const { passport } = require('./auth');
require('dotenv').config();

const app = express();
const PORT = process.env.WEB_PORT || 3000;

// Middleware
app.use(cors({
  origin: process.env.WEB_URL || 'http://localhost:5173',
  credentials: true,
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Session configuration
app.use(session({
  secret: process.env.SESSION_SECRET || 'your-secret-key-change-this',
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: process.env.NODE_ENV === 'production',
    maxAge: 24 * 60 * 60 * 1000, // 24 hours
  },
}));

// Passport initialization
app.use(passport.initialize());
app.use(passport.session());

// Routes
app.get('/', (req, res) => {
  res.json({ 
    message: 'Analyze Bot Web Dashboard API',
    version: '1.0.0',
    status: 'running',
  });
});

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// API routes
const authRoutes = require('./routes/auth');
const apiRoutes = require('./routes/api');

app.use('/api/auth', authRoutes);
app.use('/api', apiRoutes);

// Start server
app.listen(PORT, () => {
  console.log(`[Web Server] Running on port ${PORT}`);
  console.log(`[Web Server] Environment: ${process.env.NODE_ENV || 'development'}`);
});

module.exports = app;
