const express = require('express');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const cookieParser = require('cookie-parser');
const { DatabaseSync } = require('node:sqlite');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 8080;
const JWT_SECRET = process.env.SESSION_SECRET || 'wdmmg_secure_jwt_secret_key_2026';
const COOKIE_NAME = 'wdmmg_session';

// Ensure data directory exists
const dataDir = path.join(__dirname, 'data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

// Initialize SQLite Database
const dbPath = path.join(dataDir, 'money_tracker.db');
const db = new DatabaseSync(dbPath);

// Enable WAL mode & foreign keys
db.exec('PRAGMA journal_mode = WAL;');
db.exec('PRAGMA foreign_keys = ON;');

// Initialize Tables
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS transactions (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    amount REAL NOT NULL,
    date TEXT NOT NULL,
    time TEXT NOT NULL,
    merchant TEXT NOT NULL,
    category TEXT NOT NULL,
    type TEXT NOT NULL,
    payment_method TEXT NOT NULL,
    notes TEXT,
    created_at TEXT NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE INDEX IF NOT EXISTS idx_tx_user ON transactions(user_id);
  CREATE INDEX IF NOT EXISTS idx_tx_user_date ON transactions(user_id, date);

  CREATE TABLE IF NOT EXISTS action_plans (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    pattern_id TEXT,
    category TEXT,
    title TEXT NOT NULL,
    recommendation TEXT,
    current_text TEXT,
    target_text TEXT,
    estimated_saving REAL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'not-started',
    created_at TEXT NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE INDEX IF NOT EXISTS idx_action_user ON action_plans(user_id);

  CREATE TABLE IF NOT EXISTS user_settings (
    user_id TEXT PRIMARY KEY,
    saving_target REAL DEFAULT 2500,
    currency TEXT DEFAULT '₹',
    theme TEXT DEFAULT 'dark',
    updated_at TEXT NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS chat_history (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    sender TEXT NOT NULL,
    text TEXT NOT NULL,
    timestamp TEXT NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE INDEX IF NOT EXISTS idx_chat_user ON chat_history(user_id);
`);

// Middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// Security headers
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  next();
});

// Simple in-memory rate limiter for auth routes
const authAttempts = new Map(); // IP -> { count, firstAttempt }
const RATE_LIMIT_WINDOW_MS = 60 * 1000; // 1 minute
const MAX_ATTEMPTS = 15;

function authRateLimiter(req, res, next) {
  const ip = req.ip || req.connection.remoteAddress || 'unknown';
  const now = Date.now();
  const record = authAttempts.get(ip);

  if (!record || now - record.firstAttempt > RATE_LIMIT_WINDOW_MS) {
    authAttempts.set(ip, { count: 1, firstAttempt: now });
    return next();
  }

  if (record.count >= MAX_ATTEMPTS) {
    return res.status(429).json({
      error: 'Too many authentication attempts. Please wait a minute and try again.'
    });
  }

  record.count += 1;
  next();
}

// Authentication Middleware
function authenticateToken(req, res, next) {
  const token = req.cookies[COOKIE_NAME] || (req.headers.authorization && req.headers.authorization.split(' ')[1]);
  
  if (!token) {
    return res.status(401).json({ error: 'Authentication required. Please sign in.' });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    // Verify user exists in database
    const stmt = db.prepare('SELECT id, name, email FROM users WHERE id = ?');
    const user = stmt.get(decoded.id);

    if (!user) {
      res.clearCookie(COOKIE_NAME);
      return res.status(401).json({ error: 'User session expired or invalid. Please sign in again.' });
    }

    req.user = user;
    next();
  } catch (err) {
    res.clearCookie(COOKIE_NAME);
    return res.status(401).json({ error: 'Session expired or invalid. Please sign in again.' });
  }
}

// ==========================================
// AUTHENTICATION API ROUTES
// ==========================================

// Register
app.post('/api/auth/register', authRateLimiter, async (req, res) => {
  try {
    const { name, email, password, confirmPassword } = req.body;

    if (!name || typeof name !== 'string' || name.trim().length < 2) {
      return res.status(400).json({ error: 'Please enter a valid full name (at least 2 characters).' });
    }

    if (!email || typeof email !== 'string') {
      return res.status(400).json({ error: 'Please enter a valid email address.' });
    }

    const cleanEmail = email.trim().toLowerCase();
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(cleanEmail)) {
      return res.status(400).json({ error: 'Please enter a valid email address format.' });
    }

    if (!password || typeof password !== 'string' || password.length < 8) {
      return res.status(400).json({ error: 'Password must be at least 8 characters long.' });
    }

    // Must have combination of letters, numbers or special chars
    const hasLetter = /[a-zA-Z]/.test(password);
    const hasNumberOrSpecial = /[0-9!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?]/.test(password);
    if (!hasLetter || !hasNumberOrSpecial) {
      return res.status(400).json({ error: 'Password must contain a mix of letters and numbers or symbols.' });
    }

    if (confirmPassword !== undefined && password !== confirmPassword) {
      return res.status(400).json({ error: 'Passwords do not match.' });
    }

    // Check if user already exists
    const checkStmt = db.prepare('SELECT id FROM users WHERE email = ?');
    const existing = checkStmt.get(cleanEmail);
    if (existing) {
      return res.status(409).json({ error: 'An account with this email already exists.' });
    }

    // Hash password
    const saltRounds = 10;
    const passwordHash = await bcrypt.hash(password, saltRounds);
    const userId = 'usr_' + crypto.randomBytes(8).toString('hex');
    const now = new Date().toISOString();

    const insertUserStmt = db.prepare(`
      INSERT INTO users (id, name, email, password_hash, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `);
    insertUserStmt.run(userId, name.trim(), cleanEmail, passwordHash, now, now);

    // Initialize default settings
    const insertSettingsStmt = db.prepare(`
      INSERT INTO user_settings (user_id, saving_target, currency, theme, updated_at)
      VALUES (?, 2500, '₹', 'dark', ?)
    `);
    insertSettingsStmt.run(userId, now);

    // Create session token (expires in 7 days)
    const token = jwt.sign({ id: userId, email: cleanEmail }, JWT_SECRET, { expiresIn: '7d' });

    res.cookie(COOKIE_NAME, token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
    });

    return res.status(201).json({
      success: true,
      message: 'Account created successfully.',
      user: {
        id: userId,
        name: name.trim(),
        email: cleanEmail
      }
    });
  } catch (err) {
    console.error('Registration error:', err.message);
    return res.status(500).json({ error: 'Unable to complete registration right now. Please try again.' });
  }
});

// Login
app.post('/api/auth/login', authRateLimiter, async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Please provide both email and password.' });
    }

    const cleanEmail = email.trim().toLowerCase();
    const userStmt = db.prepare('SELECT id, name, email, password_hash FROM users WHERE email = ?');
    const user = userStmt.get(cleanEmail);

    if (!user) {
      return res.status(401).json({ error: 'Email or password is incorrect.' });
    }

    const isMatch = await bcrypt.compare(password, user.password_hash);
    if (!isMatch) {
      return res.status(401).json({ error: 'Email or password is incorrect.' });
    }

    // Create session token
    const token = jwt.sign({ id: user.id, email: user.email }, JWT_SECRET, { expiresIn: '7d' });

    res.cookie(COOKIE_NAME, token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 7 * 24 * 60 * 60 * 1000
    });

    return res.json({
      success: true,
      message: 'Signed in successfully.',
      user: {
        id: user.id,
        name: user.name,
        email: user.email
      }
    });
  } catch (err) {
    console.error('Login error:', err.message);
    return res.status(500).json({ error: 'Unable to sign you in right now. Please try again.' });
  }
});

// Check Current Session / Me
app.get('/api/auth/me', (req, res) => {
  const token = req.cookies[COOKIE_NAME] || (req.headers.authorization && req.headers.authorization.split(' ')[1]);

  if (!token) {
    return res.status(401).json({ authenticated: false });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    const userStmt = db.prepare('SELECT id, name, email FROM users WHERE id = ?');
    const user = userStmt.get(decoded.id);

    if (!user) {
      res.clearCookie(COOKIE_NAME);
      return res.status(401).json({ authenticated: false });
    }

    return res.json({
      authenticated: true,
      user
    });
  } catch (err) {
    res.clearCookie(COOKIE_NAME);
    return res.status(401).json({ authenticated: false });
  }
});

// Logout
app.post('/api/auth/logout', (req, res) => {
  res.clearCookie(COOKIE_NAME, {
    httpOnly: true,
    sameSite: 'lax'
  });
  return res.json({ success: true, message: 'Logged out successfully.' });
});

// Delete Account
app.delete('/api/auth/account', authenticateToken, (req, res) => {
  try {
    const userId = req.user.id;

    // Delete cascading records
    db.prepare('DELETE FROM transactions WHERE user_id = ?').run(userId);
    db.prepare('DELETE FROM action_plans WHERE user_id = ?').run(userId);
    db.prepare('DELETE FROM user_settings WHERE user_id = ?').run(userId);
    db.prepare('DELETE FROM chat_history WHERE user_id = ?').run(userId);
    db.prepare('DELETE FROM users WHERE id = ?').run(userId);

    res.clearCookie(COOKIE_NAME);
    return res.json({ success: true, message: 'Account and all associated financial data permanently deleted.' });
  } catch (err) {
    console.error('Account deletion error:', err.message);
    return res.status(500).json({ error: 'Unable to delete account at this time.' });
  }
});

// ==========================================
// TRANSACTIONS API (STRICT DATA ISOLATION)
// ==========================================

// Get All Transactions for Current User
app.get('/api/transactions', authenticateToken, (req, res) => {
  try {
    const stmt = db.prepare(`
      SELECT id, amount, date, time, merchant, category, type, payment_method, notes, created_at
      FROM transactions
      WHERE user_id = ?
      ORDER BY date DESC, time DESC
    `);
    const rows = stmt.all(req.user.id);
    return res.json(rows);
  } catch (err) {
    console.error('Fetch transactions error:', err.message);
    return res.status(500).json({ error: 'Failed to retrieve transactions.' });
  }
});

// Add Single Transaction
app.post('/api/transactions', authenticateToken, (req, res) => {
  try {
    const { amount, date, time, merchant, category, type, payment_method, notes } = req.body;

    if (!amount || isNaN(parseFloat(amount)) || parseFloat(amount) <= 0) {
      return res.status(400).json({ error: 'Valid transaction amount is required.' });
    }
    if (!merchant || !merchant.trim()) {
      return res.status(400).json({ error: 'Merchant description is required.' });
    }
    if (!date) {
      return res.status(400).json({ error: 'Transaction date is required.' });
    }

    const txId = 'tx_' + Date.now() + '_' + crypto.randomBytes(3).toString('hex');
    const now = new Date().toISOString();

    const stmt = db.prepare(`
      INSERT INTO transactions (id, user_id, amount, date, time, merchant, category, type, payment_method, notes, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      txId,
      req.user.id,
      parseFloat(amount),
      date,
      time || '12:00',
      merchant.trim(),
      category || 'Other',
      type || 'expense',
      payment_method || 'UPI',
      (notes || '').trim(),
      now
    );

    const createdTx = {
      id: txId,
      amount: parseFloat(amount),
      date,
      time: time || '12:00',
      merchant: merchant.trim(),
      category: category || 'Other',
      type: type || 'expense',
      payment_method: payment_method || 'UPI',
      notes: (notes || '').trim(),
      created_at: now
    };

    return res.status(201).json(createdTx);
  } catch (err) {
    console.error('Add transaction error:', err.message);
    return res.status(500).json({ error: 'Failed to save transaction.' });
  }
});

// Edit Transaction (with IDOR check)
app.put('/api/transactions/:id', authenticateToken, (req, res) => {
  try {
    const txId = req.params.id;
    const { amount, date, time, merchant, category, type, payment_method, notes } = req.body;

    // Check ownership
    const checkStmt = db.prepare('SELECT id FROM transactions WHERE id = ? AND user_id = ?');
    const existing = checkStmt.get(txId, req.user.id);
    if (!existing) {
      return res.status(404).json({ error: 'Transaction not found or unauthorized.' });
    }

    const stmt = db.prepare(`
      UPDATE transactions
      SET amount = ?, date = ?, time = ?, merchant = ?, category = ?, type = ?, payment_method = ?, notes = ?
      WHERE id = ? AND user_id = ?
    `);

    stmt.run(
      parseFloat(amount),
      date,
      time || '12:00',
      (merchant || '').trim(),
      category || 'Other',
      type || 'expense',
      payment_method || 'UPI',
      (notes || '').trim(),
      txId,
      req.user.id
    );

    return res.json({ success: true, message: 'Transaction updated successfully.' });
  } catch (err) {
    console.error('Update transaction error:', err.message);
    return res.status(500).json({ error: 'Failed to update transaction.' });
  }
});

// Delete Transaction (with IDOR check)
app.delete('/api/transactions/:id', authenticateToken, (req, res) => {
  try {
    const txId = req.params.id;

    // Ownership check
    const stmt = db.prepare('DELETE FROM transactions WHERE id = ? AND user_id = ?');
    const info = stmt.run(txId, req.user.id);

    if (info.changes === 0) {
      return res.status(404).json({ error: 'Transaction not found or unauthorized.' });
    }

    return res.json({ success: true, message: 'Transaction deleted.' });
  } catch (err) {
    console.error('Delete transaction error:', err.message);
    return res.status(500).json({ error: 'Failed to delete transaction.' });
  }
});

// Clear All Transactions for Current User
app.delete('/api/transactions/all/user', authenticateToken, (req, res) => {
  try {
    db.prepare('DELETE FROM transactions WHERE user_id = ?').run(req.user.id);
    return res.json({ success: true, message: 'All transactions cleared for current user.' });
  } catch (err) {
    console.error('Clear transactions error:', err.message);
    return res.status(500).json({ error: 'Failed to clear transactions.' });
  }
});

// Batch Import CSV Transactions (user_id strictly attached on server)
app.post('/api/transactions/import', authenticateToken, (req, res) => {
  try {
    const { transactions } = req.body;
    if (!Array.isArray(transactions) || transactions.length === 0) {
      return res.status(400).json({ error: 'No transactions provided for import.' });
    }

    const stmt = db.prepare(`
      INSERT INTO transactions (id, user_id, amount, date, time, merchant, category, type, payment_method, notes, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    let importedCount = 0;
    const now = new Date().toISOString();

    for (const tx of transactions) {
      if (!tx.merchant || !tx.amount || isNaN(parseFloat(tx.amount))) continue;

      const txId = 'tx_imp_' + Date.now() + '_' + crypto.randomBytes(3).toString('hex') + '_' + importedCount;
      stmt.run(
        txId,
        req.user.id,
        parseFloat(tx.amount),
        tx.date || new Date().toISOString().split('T')[0],
        tx.time || '12:00',
        String(tx.merchant).trim(),
        tx.category || 'Other',
        tx.type || 'expense',
        tx.payment_method || 'UPI',
        (tx.notes || '').trim(),
        now
      );
      importedCount++;
    }

    return res.json({
      success: true,
      importedCount,
      message: `Successfully imported ${importedCount} transactions to your account.`
    });
  } catch (err) {
    console.error('CSV import error:', err.message);
    return res.status(500).json({ error: 'Failed to process CSV import.' });
  }
});

// Seed User Demo Data
app.post('/api/transactions/demo', authenticateToken, (req, res) => {
  try {
    const { transactions } = req.body;
    if (!Array.isArray(transactions) || transactions.length === 0) {
      return res.status(400).json({ error: 'Demo data payload required.' });
    }

    // Clear previous demo/existing data if requested or simply append
    const stmt = db.prepare(`
      INSERT INTO transactions (id, user_id, amount, date, time, merchant, category, type, payment_method, notes, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const now = new Date().toISOString();
    let count = 0;

    for (const tx of transactions) {
      const txId = 'tx_demo_' + Date.now() + '_' + crypto.randomBytes(3).toString('hex') + '_' + count;
      stmt.run(
        txId,
        req.user.id,
        parseFloat(tx.amount),
        tx.date,
        tx.time || '12:00',
        tx.merchant,
        tx.category || 'Other',
        tx.type || 'expense',
        tx.payment_method || 'UPI',
        tx.notes || '',
        now
      );
      count++;
    }

    return res.json({
      success: true,
      count,
      message: `Loaded ${count} demo transactions into your account.`
    });
  } catch (err) {
    console.error('Demo data load error:', err.message);
    return res.status(500).json({ error: 'Failed to load demo data.' });
  }
});

// ==========================================
// ACTION PLANS & SAVINGS GOALS API
// ==========================================

// Get Action Plan & Goals
app.get('/api/goals', authenticateToken, (req, res) => {
  try {
    // Get target
    const setStmt = db.prepare('SELECT saving_target FROM user_settings WHERE user_id = ?');
    const userSettings = setStmt.get(req.user.id);
    const target = userSettings ? userSettings.saving_target : 2500;

    // Get habits
    const habitsStmt = db.prepare(`
      SELECT id, pattern_id as patternId, category, title, recommendation, current_text as currentText, target_text as targetText, estimated_saving as estimatedSaving, status
      FROM action_plans
      WHERE user_id = ?
      ORDER BY created_at ASC
    `);
    const habits = habitsStmt.all(req.user.id);

    return res.json({
      target,
      habits
    });
  } catch (err) {
    console.error('Fetch goals error:', err.message);
    return res.status(500).json({ error: 'Failed to load savings plan.' });
  }
});

// Update Target Goal
app.put('/api/goals/target', authenticateToken, (req, res) => {
  try {
    const { target } = req.body;
    const newTarget = parseFloat(target) || 0;

    const stmt = db.prepare(`
      INSERT INTO user_settings (user_id, saving_target, updated_at)
      VALUES (?, ?, ?)
      ON CONFLICT(user_id) DO UPDATE SET saving_target = excluded.saving_target, updated_at = excluded.updated_at
    `);
    stmt.run(req.user.id, newTarget, new Date().toISOString());

    return res.json({ success: true, target: newTarget });
  } catch (err) {
    console.error('Update savings target error:', err.message);
    return res.status(500).json({ error: 'Failed to update target.' });
  }
});

// Add Habit Goal
app.post('/api/goals/habits', authenticateToken, (req, res) => {
  try {
    const habit = req.body;
    if (!habit.title) {
      return res.status(400).json({ error: 'Habit title is required.' });
    }

    // Check duplicate patternId for this user
    if (habit.patternId) {
      const checkStmt = db.prepare('SELECT id FROM action_plans WHERE user_id = ? AND pattern_id = ?');
      const existing = checkStmt.get(req.user.id, habit.patternId);
      if (existing) {
        return res.status(409).json({ error: 'Habit already in action plan.' });
      }
    }

    const habitId = 'habit_' + Date.now() + '_' + crypto.randomBytes(2).toString('hex');
    const now = new Date().toISOString();

    const stmt = db.prepare(`
      INSERT INTO action_plans (id, user_id, pattern_id, category, title, recommendation, current_text, target_text, estimated_saving, status, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      habitId,
      req.user.id,
      habit.patternId || null,
      habit.category || 'General',
      habit.title,
      habit.recommendation || '',
      habit.currentText || '',
      habit.targetText || '',
      parseFloat(habit.estimatedSaving || 0),
      'not-started',
      now
    );

    return res.status(201).json({
      id: habitId,
      patternId: habit.patternId || null,
      category: habit.category || 'General',
      title: habit.title,
      recommendation: habit.recommendation || '',
      currentText: habit.currentText || '',
      targetText: habit.targetText || '',
      estimatedSaving: parseFloat(habit.estimatedSaving || 0),
      status: 'not-started'
    });
  } catch (err) {
    console.error('Add habit error:', err.message);
    return res.status(500).json({ error: 'Failed to add habit.' });
  }
});

// Update Habit Status (with IDOR check)
app.put('/api/goals/habits/:id', authenticateToken, (req, res) => {
  try {
    const habitId = req.params.id;
    const { status } = req.body;

    const stmt = db.prepare('UPDATE action_plans SET status = ? WHERE id = ? AND user_id = ?');
    const info = stmt.run(status, habitId, req.user.id);

    if (info.changes === 0) {
      return res.status(404).json({ error: 'Habit not found or unauthorized.' });
    }

    return res.json({ success: true, status });
  } catch (err) {
    console.error('Update habit error:', err.message);
    return res.status(500).json({ error: 'Failed to update habit.' });
  }
});

// Delete Habit (with IDOR check)
app.delete('/api/goals/habits/:id', authenticateToken, (req, res) => {
  try {
    const habitId = req.params.id;
    const stmt = db.prepare('DELETE FROM action_plans WHERE id = ? AND user_id = ?');
    const info = stmt.run(habitId, req.user.id);

    if (info.changes === 0) {
      return res.status(404).json({ error: 'Habit not found or unauthorized.' });
    }

    return res.json({ success: true });
  } catch (err) {
    console.error('Delete habit error:', err.message);
    return res.status(500).json({ error: 'Failed to remove habit.' });
  }
});

// ==========================================
// USER SETTINGS API
// ==========================================

// Get User Settings
app.get('/api/settings', authenticateToken, (req, res) => {
  try {
    const stmt = db.prepare('SELECT saving_target, currency, theme FROM user_settings WHERE user_id = ?');
    const settings = stmt.get(req.user.id) || { saving_target: 2500, currency: '₹', theme: 'dark' };

    return res.json({
      userName: req.user.name,
      email: req.user.email,
      currency: settings.currency || '₹',
      theme: settings.theme || 'dark',
      savingTarget: settings.saving_target || 2500
    });
  } catch (err) {
    console.error('Get settings error:', err.message);
    return res.status(500).json({ error: 'Failed to load user settings.' });
  }
});

// Update User Settings
app.put('/api/settings', authenticateToken, (req, res) => {
  try {
    const { currency, theme, savingTarget } = req.body;
    const now = new Date().toISOString();

    const stmt = db.prepare(`
      INSERT INTO user_settings (user_id, saving_target, currency, theme, updated_at)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(user_id) DO UPDATE SET
        saving_target = COALESCE(?, saving_target),
        currency = COALESCE(?, currency),
        theme = COALESCE(?, theme),
        updated_at = excluded.updated_at
    `);

    stmt.run(
      req.user.id,
      savingTarget !== undefined ? parseFloat(savingTarget) : 2500,
      currency || '₹',
      theme || 'dark',
      now,
      savingTarget !== undefined ? parseFloat(savingTarget) : null,
      currency || null,
      theme || null
    );

    return res.json({ success: true, message: 'Settings saved.' });
  } catch (err) {
    console.error('Update settings error:', err.message);
    return res.status(500).json({ error: 'Failed to update settings.' });
  }
});

// ==========================================
// CHAT HISTORY API
// ==========================================

// Get Chat History
app.get('/api/chat', authenticateToken, (req, res) => {
  try {
    const stmt = db.prepare('SELECT sender, text, timestamp FROM chat_history WHERE user_id = ? ORDER BY timestamp ASC LIMIT 100');
    const rows = stmt.all(req.user.id);
    return res.json(rows);
  } catch (err) {
    console.error('Get chat error:', err.message);
    return res.status(500).json({ error: 'Failed to load chat history.' });
  }
});

// Add Chat Message
app.post('/api/chat', authenticateToken, (req, res) => {
  try {
    const { sender, text } = req.body;
    if (!sender || !text) {
      return res.status(400).json({ error: 'Message sender and text required.' });
    }

    const msgId = 'msg_' + Date.now() + '_' + crypto.randomBytes(2).toString('hex');
    const now = new Date().toISOString();

    const stmt = db.prepare('INSERT INTO chat_history (id, user_id, sender, text, timestamp) VALUES (?, ?, ?, ?, ?)');
    stmt.run(msgId, req.user.id, sender, text, now);

    return res.status(201).json({ id: msgId, sender, text, timestamp: now });
  } catch (err) {
    console.error('Add chat error:', err.message);
    return res.status(500).json({ error: 'Failed to save chat message.' });
  }
});

// Clear Chat History
app.delete('/api/chat', authenticateToken, (req, res) => {
  try {
    db.prepare('DELETE FROM chat_history WHERE user_id = ?').run(req.user.id);
    return res.json({ success: true, message: 'Chat history cleared.' });
  } catch (err) {
    console.error('Clear chat error:', err.message);
    return res.status(500).json({ error: 'Failed to clear chat.' });
  }
});

// Serve Static Frontend Assets
app.use(express.static(path.join(__dirname)));

// Fallback SPA routing
app.use((req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// Global error handler
app.use((err, req, res, next) => {
  console.error('Unhandled server error:', err.message);
  res.status(500).json({ error: 'An unexpected internal error occurred.' });
});

// Start Server
app.listen(PORT, () => {
  console.log(`WDMMG Server running on http://localhost:${PORT}`);
});
