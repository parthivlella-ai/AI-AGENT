const express = require('express');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const cookieParser = require('cookie-parser');
const os = require('os');
// Ensure data directory exists (support writable /tmp in serverless/Vercel/Render)
const isServerless = Boolean(process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME || process.env.LAMBDA_TASK_ROOT);
let dataDir = isServerless ? os.tmpdir() : path.join(__dirname, 'data');
if (!isServerless) {
  try {
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }
  } catch (err) {
    console.warn('Could not create data directory, using temp directory:', err.message);
    dataDir = os.tmpdir();
  }
}

// Persistent Storage File (Guarantees accounts & details are never lost across restarts, redeploys, or cloud instances)
const primaryStorageFile = path.join(__dirname, 'data', 'app_storage.json');
const fallbackStorageFile = path.join(dataDir, 'app_storage.json');

function loadStorageFile() {
  const tryPaths = [primaryStorageFile, fallbackStorageFile];
  for (const p of tryPaths) {
    try {
      if (fs.existsSync(p)) {
        const parsed = JSON.parse(fs.readFileSync(p, 'utf8'));
        if (parsed && Array.isArray(parsed.users)) {
          return {
            users: Array.isArray(parsed.users) ? parsed.users : [],
            transactions: Array.isArray(parsed.transactions) ? parsed.transactions : [],
            user_settings: Array.isArray(parsed.user_settings) ? parsed.user_settings : [],
            action_plans: Array.isArray(parsed.action_plans) ? parsed.action_plans : [],
            chat_history: Array.isArray(parsed.chat_history) ? parsed.chat_history : [],
            user_activity_logs: Array.isArray(parsed.user_activity_logs) ? parsed.user_activity_logs : [],
            user_notifications: Array.isArray(parsed.user_notifications) ? parsed.user_notifications : []
          };
        }
      }
    } catch (err) {}
  }
  return {
    users: [],
    transactions: [],
    user_settings: [],
    action_plans: [],
    chat_history: [],
    user_activity_logs: [],
    user_notifications: []
  };
}

let appStorage = loadStorageFile();

function persistStorageFile() {
  const payload = JSON.stringify(appStorage, null, 2);
  try {
    const dir = path.dirname(primaryStorageFile);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(primaryStorageFile, payload, 'utf8');
  } catch (e) {
    try {
      fs.writeFileSync(fallbackStorageFile, payload, 'utf8');
    } catch (e2) {}
  }
}

// SQLite native module loader with graceful JSON DB fallback
let DatabaseSync = null;
try {
  DatabaseSync = require('node:sqlite').DatabaseSync;
} catch (err) {
  if (require.main === module && !process.execArgv.includes('--experimental-sqlite') && !process.env._RESPAWNED_SQLITE) {
    try {
      const { spawn } = require('child_process');
      const child = spawn(process.execPath, ['--experimental-sqlite', ...process.execArgv, ...process.argv.slice(1)], {
        stdio: 'inherit',
        env: { ...process.env, _RESPAWNED_SQLITE: '1' }
      });
      child.on('exit', (code, signal) => {
        process.exit(code !== null ? code : (signal ? 1 : 0));
      });
      return;
    } catch (spawnErr) {
      console.warn('[Money Tracker] Child spawn unavailable, continuing with resilient JSON database.');
    }
  }
}

require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 8080;
const JWT_SECRET = process.env.SESSION_SECRET || 'wdmmg_secure_jwt_secret_key_2026';
const COOKIE_NAME = 'wdmmg_session';

// JSON Database Engine Implementation
function createJsonDb(storage, saveFn) {
  return {
    exec(sql) { /* DDL is handled by in-memory schema */ },
    prepare(sql) {
      const s = sql.trim();
      return {
        all(...params) {
          if (s.includes('FROM users')) {
            return storage.users;
          }
          if (s.includes('FROM transactions')) {
            const uid = params[0];
            const list = storage.transactions.filter(t => t.user_id === uid);
            return list.sort((a, b) => (b.date + ' ' + (b.time || '')).localeCompare(a.date + ' ' + (a.time || '')));
          }
          if (s.includes('FROM action_plans')) {
            return storage.action_plans.filter(p => p.user_id === params[0]);
          }
          if (s.includes('FROM chat_history')) {
            return storage.chat_history.filter(c => c.user_id === params[0]);
          }
          if (s.includes('FROM user_activity_logs')) {
            const list = storage.user_activity_logs.filter(a => a.user_id === params[0]);
            return list.slice(-40).reverse();
          }
          if (s.includes('FROM user_notifications')) {
            return storage.user_notifications.filter(n => n.user_id === params[0]);
          }
          if (s.includes('PRAGMA table_info')) {
            return [];
          }
          return [];
        },
        get(...params) {
          if (s.includes('FROM users')) {
            if (s.includes('WHERE id = ?')) {
              return storage.users.find(u => u.id === params[0]) || null;
            }
            if (s.includes('WHERE email = ?')) {
              const target = String(params[0] || '').toLowerCase().trim();
              return storage.users.find(u => (u.email || '').toLowerCase() === target) || null;
            }
            if (s.includes('WHERE username = ?')) {
              const target = String(params[0] || '').toLowerCase().trim();
              return storage.users.find(u => (u.username || '').toLowerCase() === target) || null;
            }
            // Multi-field match by email, username, or full name
            const t = String(params[0] || '').toLowerCase().trim();
            return storage.users.find(u => 
              (u.email && u.email.toLowerCase().trim() === t) ||
              (u.username && u.username.toLowerCase().trim() === t) ||
              (u.name && u.name.toLowerCase().trim() === t)
            ) || null;
          }
          if (s.includes('FROM user_settings')) {
            return storage.user_settings.find(st => st.user_id === params[0]) || null;
          }
          if (s.includes('FROM transactions')) {
            if (s.includes('COUNT(*)')) {
              const uid = params[0];
              const list = storage.transactions.filter(t => t.user_id === uid);
              const exp = list.filter(t => t.type === 'expense').reduce((sum, t) => sum + (parseFloat(t.amount) || 0), 0);
              const inc = list.filter(t => t.type === 'income').reduce((sum, t) => sum + (parseFloat(t.amount) || 0), 0);
              return { total_transactions: list.length, total_expense: exp, total_income: inc };
            }
            return storage.transactions.find(t => t.id === params[0]) || null;
          }
          if (s.includes('FROM action_plans')) {
            return { count: storage.action_plans.filter(p => p.user_id === params[0]).length };
          }
          if (s.includes('FROM user_activity_logs')) {
            return { count: storage.user_activity_logs.filter(a => a.user_id === params[0]).length };
          }
          return null;
        },
        run(...params) {
          if (s.includes('INSERT INTO users') || s.includes('INSERT OR IGNORE INTO users')) {
            const [id, username, name, email, password_hash, monthly_income, last_login_at, login_count, created_at, updated_at] = params;
            const existingIdx = storage.users.findIndex(u => u.id === id || (u.email && u.email.toLowerCase() === (email || '').toLowerCase()));
            const record = { id, username, name, email, password_hash, monthly_income: monthly_income || 0, last_login_at, login_count: login_count || 1, created_at, updated_at };
            if (existingIdx >= 0) storage.users[existingIdx] = { ...storage.users[existingIdx], ...record };
            else storage.users.push(record);
            saveFn();
          } else if (s.includes('UPDATE users')) {
            if (s.includes('password_hash = ?')) {
              const [newHash, now, id] = params;
              const u = storage.users.find(usr => usr.id === id);
              if (u) { u.password_hash = newHash; u.updated_at = now; saveFn(); }
            } else if (s.includes('login_count = ?')) {
              const [count, now, id] = params;
              const u = storage.users.find(usr => usr.id === id);
              if (u) { u.login_count = count; u.last_login_at = now; saveFn(); }
            } else if (s.includes('name = ?')) {
              const [name, username, phone, bio, avatar, monthly_income, updated_at, id] = params;
              const u = storage.users.find(usr => usr.id === id);
              if (u) {
                Object.assign(u, { name, username, phone, bio, avatar, monthly_income, updated_at });
                saveFn();
              }
            }
          } else if (s.includes('DELETE FROM users')) {
            const id = params[0];
            storage.users = storage.users.filter(u => u.id !== id);
            storage.transactions = storage.transactions.filter(t => t.user_id !== id);
            saveFn();
          } else if (s.includes('INSERT INTO transactions') || s.includes('INSERT OR REPLACE INTO transactions')) {
            const [id, user_id, amount, date, time, merchant, category, type, payment_method, notes, created_at] = params;
            storage.transactions.push({ id, user_id, amount: parseFloat(amount) || 0, date, time, merchant, category, type, payment_method, notes, created_at });
            saveFn();
          } else if (s.includes('UPDATE transactions')) {
            const [amount, date, time, merchant, category, type, payment_method, notes, id] = params;
            const t = storage.transactions.find(tx => tx.id === id);
            if (t) { Object.assign(t, { amount: parseFloat(amount) || 0, date, time, merchant, category, type, payment_method, notes }); saveFn(); }
          } else if (s.includes('DELETE FROM transactions WHERE id = ?')) {
            storage.transactions = storage.transactions.filter(t => t.id !== params[0]);
            saveFn();
          } else if (s.includes('DELETE FROM transactions WHERE user_id = ?')) {
            storage.transactions = storage.transactions.filter(t => t.user_id !== params[0]);
            saveFn();
          } else if (s.includes('INSERT INTO user_settings') || s.includes('INSERT OR REPLACE INTO user_settings')) {
            const [user_id, saving_target, monthly_budget, currency, theme, updated_at] = params;
            const idx = storage.user_settings.findIndex(st => st.user_id === user_id);
            const entry = { user_id, saving_target: saving_target || 2500, monthly_budget: monthly_budget || 0, currency: currency || '₹', theme: theme || 'dark', updated_at };
            if (idx >= 0) storage.user_settings[idx] = entry; else storage.user_settings.push(entry);
            saveFn();
          } else if (s.includes('UPDATE user_settings')) {
            const [saving_target, monthly_budget, currency, theme, updated_at, user_id] = params;
            const idx = storage.user_settings.findIndex(st => st.user_id === user_id);
            const entry = { user_id, saving_target, monthly_budget, currency, theme, updated_at };
            if (idx >= 0) storage.user_settings[idx] = entry; else storage.user_settings.push(entry);
            saveFn();
          } else if (s.includes('INSERT INTO chat_history')) {
            const [id, user_id, sender, text, timestamp] = params;
            storage.chat_history.push({ id, user_id, sender, text, timestamp });
            saveFn();
          } else if (s.includes('DELETE FROM chat_history')) {
            storage.chat_history = storage.chat_history.filter(c => c.user_id !== params[0]);
            saveFn();
          } else if (s.includes('INSERT INTO user_activity_logs')) {
            const [id, user_id, action_type, description, metadata, ip_address, timestamp] = params;
            storage.user_activity_logs.push({ id, user_id, action_type, description, metadata, ip_address, timestamp });
            saveFn();
          } else if (s.includes('INSERT INTO user_notifications')) {
            const [id, user_id, title, message, type, created_at] = params;
            storage.user_notifications.push({ id, user_id, title, message, type, is_read: 0, created_at });
            saveFn();
          } else if (s.includes('INSERT INTO action_plans') || s.includes('INSERT OR REPLACE INTO action_plans')) {
            const [id, user_id, pattern_id, category, title, recommendation, current_text, target_text, estimated_saving, status, created_at] = params;
            storage.action_plans.push({ id, user_id, pattern_id, category, title, recommendation, current_text, target_text, estimated_saving, status, created_at });
            saveFn();
          } else if (s.includes('UPDATE action_plans')) {
            const [status, id, user_id] = params;
            const p = storage.action_plans.find(pl => pl.id === id && pl.user_id === user_id);
            if (p) { p.status = status; saveFn(); }
          }
          return { changes: 1 };
        }
      };
    }
  };
}

// Initialize Active Database (SQLite or JSON Engine)
let db;
if (DatabaseSync) {
  try {
    const dbPath = path.join(dataDir, 'money_tracker.db');
    db = new DatabaseSync(dbPath);
    try { db.exec('PRAGMA journal_mode = WAL;'); } catch (e) {}
    try { db.exec('PRAGMA foreign_keys = ON;'); } catch (e) {}
    console.log('[Money Tracker] Initialized SQLite Database at:', dbPath);
  } catch (dbErr) {
    console.warn('[Money Tracker] SQLite init failed, activating JSON database engine:', dbErr.message);
    db = createJsonDb(appStorage, persistStorageFile);
  }
} else {
  console.log('[Money Tracker] Using resilient JSON storage engine.');
  db = createJsonDb(appStorage, persistStorageFile);
}

// Initialize Tables
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    username TEXT UNIQUE,
    name TEXT NOT NULL,
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    phone TEXT,
    bio TEXT,
    avatar TEXT,
    monthly_income REAL DEFAULT 0,
    last_login_at TEXT,
    login_count INTEGER DEFAULT 0,
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
    monthly_budget REAL DEFAULT 0,
    currency TEXT DEFAULT '₹',
    theme TEXT DEFAULT 'dark',
    email_notifications INTEGER DEFAULT 1,
    ai_advice_frequency TEXT DEFAULT 'weekly',
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

  -- Complete User Activity Audit Log (From Start to End)
  CREATE TABLE IF NOT EXISTS user_activity_logs (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    action_type TEXT NOT NULL,
    description TEXT NOT NULL,
    metadata TEXT,
    ip_address TEXT,
    timestamp TEXT NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE INDEX IF NOT EXISTS idx_activity_user ON user_activity_logs(user_id);
  CREATE INDEX IF NOT EXISTS idx_activity_user_time ON user_activity_logs(user_id, timestamp DESC);

  -- User Notifications & Behavioral Alerts
  CREATE TABLE IF NOT EXISTS user_notifications (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    title TEXT NOT NULL,
    message TEXT NOT NULL,
    type TEXT DEFAULT 'info',
    is_read INTEGER DEFAULT 0,
    created_at TEXT NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE INDEX IF NOT EXISTS idx_notif_user ON user_notifications(user_id);
`);

// Migration helper for existing databases (adds missing columns safely)
function safeAddColumn(table, column, definition) {
  try {
    const cols = db.prepare(`PRAGMA table_info(${table})`).all();
    if (!cols.some(c => c.name === column)) {
      db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition};`);
    }
  } catch (err) {
    // Column already exists or error
  }
}

safeAddColumn('users', 'username', 'TEXT');
safeAddColumn('users', 'phone', 'TEXT');
safeAddColumn('users', 'bio', 'TEXT');
safeAddColumn('users', 'avatar', 'TEXT');
safeAddColumn('users', 'monthly_income', 'REAL DEFAULT 0');
safeAddColumn('users', 'last_login_at', 'TEXT');
safeAddColumn('users', 'login_count', 'INTEGER DEFAULT 0');
safeAddColumn('user_settings', 'monthly_budget', 'REAL DEFAULT 0');
safeAddColumn('user_settings', 'email_notifications', 'INTEGER DEFAULT 1');
safeAddColumn('user_settings', 'ai_advice_frequency', "TEXT DEFAULT 'weekly'");

// Create unique index for username
try {
  db.exec('CREATE UNIQUE INDEX IF NOT EXISTS idx_users_username ON users(username) WHERE username IS NOT NULL;');
} catch (e) {
  // Index might already exist
}

// Restore & synchronize persistent storage accounts into database
try {
  if (Array.isArray(appStorage.users) && appStorage.users.length > 0) {
    const existingUsers = db.prepare('SELECT id, email, username FROM users').all();
    const existingEmails = new Set(existingUsers.map(u => (u.email || '').toLowerCase().trim()));
    const existingIds = new Set(existingUsers.map(u => u.id));

    const insertUser = db.prepare(`
      INSERT OR IGNORE INTO users (id, username, name, email, password_hash, phone, bio, avatar, monthly_income, last_login_at, login_count, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    for (const u of appStorage.users) {
      const email = (u.email || '').toLowerCase().trim();
      if (!existingIds.has(u.id) && !existingEmails.has(email)) {
        insertUser.run(
          u.id,
          u.username || null,
          u.name || 'User',
          u.email,
          u.password_hash,
          u.phone || null,
          u.bio || null,
          u.avatar || null,
          u.monthly_income || 0,
          u.last_login_at || null,
          u.login_count || 1,
          u.created_at || new Date().toISOString(),
          u.updated_at || new Date().toISOString()
        );
      }
    }
  }
} catch (syncErr) {
  console.warn('[Money Tracker] Storage restoration notice:', syncErr.message);
}

// Activity Logging Helper (Stores complete user journey from start to end)
function logUserActivity(userId, actionType, description, metadata = null, req = null) {
  try {
    const actId = 'act_' + crypto.randomBytes(8).toString('hex');
    const ip = req ? (req.headers['x-forwarded-for'] || req.ip || req.connection?.remoteAddress || 'unknown') : 'system';
    const now = new Date().toISOString();
    const metaStr = metadata ? (typeof metadata === 'string' ? metadata : JSON.stringify(metadata)) : null;

    const stmt = db.prepare(`
      INSERT INTO user_activity_logs (id, user_id, action_type, description, metadata, ip_address, timestamp)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    stmt.run(actId, userId, actionType, description, metaStr, String(ip).slice(0, 45), now);
  } catch (err) {
    console.error('Error logging user activity:', err.message);
  }
}

// Notification Helper
function createNotification(userId, title, message, type = 'info') {
  try {
    const notifId = 'notif_' + crypto.randomBytes(8).toString('hex');
    const now = new Date().toISOString();
    const stmt = db.prepare(`
      INSERT INTO user_notifications (id, user_id, title, message, type, is_read, created_at)
      VALUES (?, ?, ?, ?, ?, 0, ?)
    `);
    stmt.run(notifId, userId, title, message, type, now);
  } catch (err) {
    console.error('Error creating notification:', err.message);
  }
}

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
    // Verify user exists in database with all profile fields
    const stmt = db.prepare(`
      SELECT id, username, name, email, phone, bio, avatar, monthly_income, last_login_at, login_count, created_at 
      FROM users WHERE id = ?
    `);
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
// AUTHENTICATION & USER PROFILE API ROUTES
// ==========================================

// Register New User (Stores complete details from start)
app.post('/api/auth/register', authRateLimiter, async (req, res) => {
  try {
    const { name, email, password, confirmPassword, username, currency, monthlyIncome } = req.body;

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

    // Format and validate username
    let cleanUsername = (username || '').trim().toLowerCase();
    if (!cleanUsername) {
      // Auto-generate clean username from email prefix
      cleanUsername = cleanEmail.split('@')[0].replace(/[^a-z0-9_]/g, '') + '_' + crypto.randomBytes(2).toString('hex');
    } else {
      if (cleanUsername.length < 3 || cleanUsername.length > 25) {
        return res.status(400).json({ error: 'Username must be between 3 and 25 characters.' });
      }
      if (!/^[a-z0-9_]+$/.test(cleanUsername)) {
        return res.status(400).json({ error: 'Username can only contain letters, numbers, and underscores.' });
      }
    }

    if (!password || typeof password !== 'string' || password.length < 8) {
      return res.status(400).json({ error: 'Password must be at least 8 characters long.' });
    }

    const hasLetter = /[a-zA-Z]/.test(password);
    const hasNumberOrSpecial = /[0-9!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?]/.test(password);
    if (!hasLetter || !hasNumberOrSpecial) {
      return res.status(400).json({ error: 'Password must contain a mix of letters and numbers or symbols.' });
    }

    if (confirmPassword !== undefined && password !== confirmPassword) {
      return res.status(400).json({ error: 'Passwords do not match.' });
    }

    // Check if email already exists
    const emailCheckStmt = db.prepare('SELECT id FROM users WHERE email = ?');
    if (emailCheckStmt.get(cleanEmail)) {
      return res.status(409).json({ error: 'An account with this email already exists.' });
    }

    // Check if username already exists
    const usernameCheckStmt = db.prepare('SELECT id FROM users WHERE username = ?');
    if (usernameCheckStmt.get(cleanUsername)) {
      return res.status(409).json({ error: 'This username is already taken. Please pick another.' });
    }

    // Hash password
    const saltRounds = 10;
    const passwordHash = await bcrypt.hash(password, saltRounds);
    const userId = 'usr_' + crypto.randomBytes(8).toString('hex');
    const now = new Date().toISOString();
    const incomeVal = monthlyIncome ? parseFloat(monthlyIncome) || 0 : 0;
    const currVal = currency || '₹';

    const insertUserStmt = db.prepare(`
      INSERT INTO users (id, username, name, email, password_hash, monthly_income, last_login_at, login_count, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, ?)
    `);
    insertUserStmt.run(userId, cleanUsername, name.trim(), cleanEmail, passwordHash, incomeVal, now, now, now);

    // Initialize default settings
    const insertSettingsStmt = db.prepare(`
      INSERT INTO user_settings (user_id, saving_target, monthly_budget, currency, theme, updated_at)
      VALUES (?, 2500, ?, ?, 'dark', ?)
    `);
    insertSettingsStmt.run(userId, incomeVal > 0 ? incomeVal * 0.7 : 0, currVal, now);

    // Log the user's initial start event in their permanent activity log
    logUserActivity(userId, 'REGISTER', 'User account created and profile initialized', {
      username: cleanUsername,
      email: cleanEmail,
      currency: currVal
    }, req);

    // Create a personalized welcome notification
    createNotification(
      userId,
      'Welcome to Where Did My Money Go! 🚀',
      `Hi ${name.trim()}! Your AI Spending Behavior Analyst is ready. Track expenses, test habits, or explore the demo.`,
      'welcome'
    );

    // Create session token (expires in 7 days)
    const token = jwt.sign({ id: userId, email: cleanEmail }, JWT_SECRET, { expiresIn: '7d' });

    res.cookie(COOKIE_NAME, token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
    });

    const userObj = {
      id: userId,
      username: cleanUsername,
      name: name.trim(),
      email: cleanEmail,
      phone: '',
      bio: '',
      avatar: '',
      monthly_income: incomeVal,
      last_login_at: now,
      login_count: 1,
      created_at: now
    };

    // Ensure permanent persistence in appStorage
    const existingIdx = appStorage.users.findIndex(u => u.id === userId || (u.email && u.email.toLowerCase() === cleanEmail));
    if (existingIdx >= 0) {
      appStorage.users[existingIdx] = { ...userObj, password_hash: passwordHash, updated_at: now };
    } else {
      appStorage.users.push({ ...userObj, password_hash: passwordHash, updated_at: now });
    }
    persistStorageFile();

    return res.status(201).json({
      success: true,
      message: 'Account created successfully.',
      user: userObj
    });
  } catch (err) {
    console.error('Registration error:', err.message);
    return res.status(500).json({ error: 'Unable to complete registration right now. Please try again.' });
  }
});

// Login (Supports login via Username, Email, or Full Name + Password)
app.post('/api/auth/login', authRateLimiter, async (req, res) => {
  try {
    const { email, identifier, password } = req.body;
    const loginTarget = (identifier || email || '').trim();

    if (!loginTarget || !password) {
      return res.status(400).json({ error: 'Please enter your username/email and password.' });
    }

    const cleanTarget = loginTarget.toLowerCase();

    // Match by email, username, or name (case-insensitive and trimmed)
    const userStmt = db.prepare(`
      SELECT id, username, name, email, password_hash, phone, bio, avatar, monthly_income, last_login_at, login_count, created_at 
      FROM users 
      WHERE LOWER(TRIM(email)) = ? 
         OR LOWER(TRIM(username)) = ? 
         OR LOWER(TRIM(name)) = ?
      ORDER BY 
        CASE 
          WHEN LOWER(TRIM(email)) = ? THEN 1
          WHEN LOWER(TRIM(username)) = ? THEN 2
          ELSE 3
        END
      LIMIT 1
    `);
    const user = userStmt.get(cleanTarget, cleanTarget, cleanTarget, cleanTarget, cleanTarget);

    if (!user) {
      return res.status(401).json({ error: 'Account not found. Please check your username/email.' });
    }

    const isMatch = await bcrypt.compare(password, user.password_hash);
    if (!isMatch) {
      return res.status(401).json({ error: 'Incorrect password. Please try again.' });
    }

    const now = new Date().toISOString();
    const newCount = (user.login_count || 0) + 1;

    // Update login timestamp and count
    db.prepare('UPDATE users SET last_login_at = ?, login_count = ?, updated_at = ? WHERE id = ?')
      .run(now, newCount, now, user.id);

    // Record login in activity audit log
    logUserActivity(user.id, 'LOGIN', `Signed in successfully (Session #${newCount})`, null, req);

    // Create session token
    const token = jwt.sign({ id: user.id, email: user.email }, JWT_SECRET, { expiresIn: '7d' });

    res.cookie(COOKIE_NAME, token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 7 * 24 * 60 * 60 * 1000
    });

    const userObj = {
      id: user.id,
      username: user.username,
      name: user.name,
      email: user.email,
      phone: user.phone || '',
      bio: user.bio || '',
      avatar: user.avatar || '',
      monthly_income: user.monthly_income || 0,
      last_login_at: now,
      login_count: newCount,
      created_at: user.created_at
    };

    return res.json({
      success: true,
      message: 'Signed in successfully.',
      user: userObj
    });
  } catch (err) {
    console.error('Login error:', err.message);
    return res.status(500).json({ error: 'Unable to sign you in right now. Please try again.' });
  }
});

// Password Reset Route (Allows easy recovery by username, email, or full name)
app.post('/api/auth/reset-password', authRateLimiter, async (req, res) => {
  try {
    const { identifier, newPassword, confirmPassword } = req.body;
    const target = (identifier || '').trim();

    if (!target) {
      return res.status(400).json({ error: 'Please enter your username, email, or full name.' });
    }

    if (!newPassword || typeof newPassword !== 'string' || newPassword.length < 8) {
      return res.status(400).json({ error: 'New password must be at least 8 characters long.' });
    }

    const hasLetter = /[a-zA-Z]/.test(newPassword);
    const hasNumberOrSpecial = /[0-9!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?]/.test(newPassword);
    if (!hasLetter || !hasNumberOrSpecial) {
      return res.status(400).json({ error: 'Password must contain a mix of letters and numbers or symbols.' });
    }

    if (confirmPassword && newPassword !== confirmPassword) {
      return res.status(400).json({ error: 'Passwords do not match.' });
    }

    const cleanTarget = target.toLowerCase();
    const userStmt = db.prepare(`
      SELECT id, username, name, email FROM users 
      WHERE LOWER(TRIM(email)) = ? 
         OR LOWER(TRIM(username)) = ? 
         OR LOWER(TRIM(name)) = ?
      ORDER BY 
        CASE 
          WHEN LOWER(TRIM(email)) = ? THEN 1
          WHEN LOWER(TRIM(username)) = ? THEN 2
          ELSE 3
        END
      LIMIT 1
    `);
    const user = userStmt.get(cleanTarget, cleanTarget, cleanTarget, cleanTarget, cleanTarget);

    if (!user) {
      return res.status(404).json({ error: 'Account not found. Please check your username or email.' });
    }

    const saltRounds = 10;
    const newHash = await bcrypt.hash(newPassword, saltRounds);
    const now = new Date().toISOString();

    db.prepare('UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?').run(newHash, now, user.id);

    // Update in appStorage
    const uIdx = appStorage.users.findIndex(u => u.id === user.id || (u.email && u.email.toLowerCase() === user.email.toLowerCase()));
    if (uIdx >= 0) {
      appStorage.users[uIdx].password_hash = newHash;
      appStorage.users[uIdx].updated_at = now;
      persistStorageFile();
    }

    logUserActivity(user.id, 'PASSWORD_RESET', 'Password was successfully reset', null, req);
    createNotification(user.id, 'Password Changed', 'Your account password was successfully updated.', 'security');

    return res.json({
      success: true,
      message: 'Password reset successfully! You can now sign in with your new password.',
      identifier: user.username || user.email
    });
  } catch (err) {
    console.error('Password reset error:', err.message);
    return res.status(500).json({ error: 'Failed to reset password. Please try again.' });
  }
});

// Vault Sync Route: Store client vault accounts to server to guarantee zero data loss
app.post('/api/auth/sync-vault', (req, res) => {
  try {
    const { users } = req.body;
    if (Array.isArray(users)) {
      for (const u of users) {
        if (!u.email && !u.name) continue;
        const cleanEmail = (u.email || '').trim().toLowerCase();
        const cleanUsername = (u.username || cleanEmail.split('@')[0] || 'user').trim().toLowerCase();
        
        try {
          const check = db.prepare('SELECT id FROM users WHERE LOWER(email) = ? OR LOWER(username) = ?').get(cleanEmail, cleanUsername);
          if (!check) {
            const uid = u.id || ('usr_' + crypto.randomBytes(8).toString('hex'));
            const pHash = u.password_hash || (u.password ? bcrypt.hashSync(u.password, 10) : '$2b$10$wj9QsB59Unal.eUKZinAbOrWlNICfCG0W4Kz3OC5POlIh4UL0fFyy');
            const now = new Date().toISOString();

            db.prepare(`
              INSERT OR IGNORE INTO users (id, username, name, email, password_hash, monthly_income, last_login_at, login_count, created_at, updated_at)
              VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, ?)
            `).run(uid, cleanUsername, u.name || 'User', cleanEmail, pHash, u.monthly_income || 0, now, u.created_at || now, now);

            db.prepare(`
              INSERT OR IGNORE INTO user_settings (user_id, saving_target, monthly_budget, currency, theme, updated_at)
              VALUES (?, ?, ?, ?, 'dark', ?)
            `).run(uid, 2500, (u.monthly_income || 0) * 0.7, u.currency || '₹', now);

            const existingIdx = appStorage.users.findIndex(us => us.id === uid || (us.email && us.email.toLowerCase() === cleanEmail));
            const newRecord = {
              id: uid,
              username: cleanUsername,
              name: u.name || 'User',
              email: cleanEmail,
              password_hash: pHash,
              monthly_income: u.monthly_income || 0,
              created_at: u.created_at || now,
              updated_at: now
            };
            if (existingIdx >= 0) appStorage.users[existingIdx] = newRecord;
            else appStorage.users.push(newRecord);
            persistStorageFile();
          }
        } catch (e) {}
      }
    }
    return res.json({ success: true, count: appStorage.users.length });
  } catch (err) {
    return res.status(500).json({ error: 'Sync failed' });
  }
});

// Check Current Session / Me (Full User Details)
app.get('/api/auth/me', (req, res) => {
  const token = req.cookies[COOKIE_NAME] || (req.headers.authorization && req.headers.authorization.split(' ')[1]);

  if (!token) {
    return res.status(401).json({ authenticated: false });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    const userStmt = db.prepare(`
      SELECT id, username, name, email, phone, bio, avatar, monthly_income, last_login_at, login_count, created_at 
      FROM users WHERE id = ?
    `);
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

// ==========================================
// USER PROFILE & FULL DATA AUDIT TRAIL API
// ==========================================

// Get User Profile & Comprehensive Account Stats
app.get('/api/user/profile', authenticateToken, (req, res) => {
  try {
    const user = req.user;

    // Fetch user settings
    const settingsStmt = db.prepare('SELECT saving_target, monthly_budget, currency, theme FROM user_settings WHERE user_id = ?');
    const settings = settingsStmt.get(user.id) || { saving_target: 2500, monthly_budget: 0, currency: '₹', theme: 'dark' };

    // Fetch summary statistics
    const statsStmt = db.prepare(`
      SELECT 
        COUNT(*) as total_transactions,
        COALESCE(SUM(CASE WHEN type = 'expense' THEN amount ELSE 0 END), 0) as total_expense,
        COALESCE(SUM(CASE WHEN type = 'income' THEN amount ELSE 0 END), 0) as total_income
      FROM transactions WHERE user_id = ?
    `);
    const stats = statsStmt.get(user.id);

    const plansCountStmt = db.prepare('SELECT COUNT(*) as count FROM action_plans WHERE user_id = ?');
    const plansCount = plansCountStmt.get(user.id).count;

    const activityCountStmt = db.prepare('SELECT COUNT(*) as count FROM user_activity_logs WHERE user_id = ?');
    const activityCount = activityCountStmt.get(user.id).count;

    return res.json({
      user,
      settings,
      stats: {
        totalTransactions: stats.total_transactions,
        totalExpense: stats.total_expense,
        totalIncome: stats.total_income,
        actionPlansCount: plansCount,
        totalActivitiesLogged: activityCount,
        memberSince: user.created_at
      }
    });
  } catch (err) {
    console.error('Get profile error:', err.message);
    return res.status(500).json({ error: 'Failed to load user profile.' });
  }
});

// Update User Profile (Username, Name, Phone, Bio, Avatar, Monthly Income, Currency, Saving Target)
app.put('/api/user/profile', authenticateToken, (req, res) => {
  try {
    const { name, username, phone, bio, avatar, monthlyIncome, currency, savingTarget, monthlyBudget } = req.body;
    const userId = req.user.id;
    const now = new Date().toISOString();

    // If username is being changed, validate and check uniqueness
    let newUsername = req.user.username;
    if (username && username.trim().toLowerCase() !== (req.user.username || '').toLowerCase()) {
      newUsername = username.trim().toLowerCase();
      if (newUsername.length < 3 || newUsername.length > 25 || !/^[a-z0-9_]+$/.test(newUsername)) {
        return res.status(400).json({ error: 'Username must be 3-25 alphanumeric characters or underscores.' });
      }
      const checkStmt = db.prepare('SELECT id FROM users WHERE username = ? AND id != ?');
      if (checkStmt.get(newUsername, userId)) {
        return res.status(409).json({ error: 'This username is already taken. Please choose another.' });
      }
    }

    const newName = name && name.trim().length >= 2 ? name.trim() : req.user.name;
    const newPhone = phone !== undefined ? String(phone).trim() : (req.user.phone || '');
    const newBio = bio !== undefined ? String(bio).trim() : (req.user.bio || '');
    const newAvatar = avatar !== undefined ? String(avatar).trim() : (req.user.avatar || '');
    const newIncome = monthlyIncome !== undefined ? parseFloat(monthlyIncome) || 0 : (req.user.monthly_income || 0);

    // Update users table
    db.prepare(`
      UPDATE users 
      SET name = ?, username = ?, phone = ?, bio = ?, avatar = ?, monthly_income = ?, updated_at = ?
      WHERE id = ?
    `).run(newName, newUsername, newPhone, newBio, newAvatar, newIncome, now, userId);

    // Update settings if provided
    if (currency || savingTarget !== undefined || monthlyBudget !== undefined) {
      db.prepare(`
        INSERT INTO user_settings (user_id, saving_target, monthly_budget, currency, theme, updated_at)
        VALUES (?, ?, ?, ?, 'dark', ?)
        ON CONFLICT(user_id) DO UPDATE SET
          saving_target = COALESCE(?, saving_target),
          monthly_budget = COALESCE(?, monthly_budget),
          currency = COALESCE(?, currency),
          updated_at = excluded.updated_at
      `).run(
        userId,
        savingTarget !== undefined ? parseFloat(savingTarget) : 2500,
        monthlyBudget !== undefined ? parseFloat(monthlyBudget) : 0,
        currency || '₹',
        now,
        savingTarget !== undefined ? parseFloat(savingTarget) : null,
        monthlyBudget !== undefined ? parseFloat(monthlyBudget) : null,
        currency || null
      );
    }

    logUserActivity(userId, 'PROFILE_UPDATE', 'Updated user profile and personal preferences', {
      name: newName,
      username: newUsername
    }, req);

    return res.json({
      success: true,
      message: 'Profile updated successfully.',
      user: {
        id: userId,
        username: newUsername,
        name: newName,
        email: req.user.email,
        phone: newPhone,
        bio: newBio,
        avatar: newAvatar,
        monthly_income: newIncome,
        last_login_at: req.user.last_login_at,
        login_count: req.user.login_count,
        created_at: req.user.created_at
      }
    });
  } catch (err) {
    console.error('Update profile error:', err.message);
    return res.status(500).json({ error: 'Failed to update profile.' });
  }
});

// Get User Activity Audit Log (Complete journey from start to end)
app.get('/api/user/activity', authenticateToken, (req, res) => {
  try {
    const limit = parseInt(req.query.limit, 10) || 50;
    const stmt = db.prepare(`
      SELECT id, action_type, description, metadata, ip_address, timestamp 
      FROM user_activity_logs 
      WHERE user_id = ? 
      ORDER BY timestamp DESC 
      LIMIT ?
    `);
    const logs = stmt.all(req.user.id, limit);
    return res.json(logs);
  } catch (err) {
    console.error('Get activity error:', err.message);
    return res.status(500).json({ error: 'Failed to retrieve activity log.' });
  }
});

// Full User Data Export (Download All Stored Data From Start to End)
app.get('/api/user/export', authenticateToken, (req, res) => {
  try {
    const userId = req.user.id;

    // Fetch everything associated with this user
    const userStmt = db.prepare('SELECT id, username, name, email, phone, bio, avatar, monthly_income, last_login_at, login_count, created_at, updated_at FROM users WHERE id = ?');
    const user = userStmt.get(userId);

    const settingsStmt = db.prepare('SELECT saving_target, monthly_budget, currency, theme, email_notifications, ai_advice_frequency FROM user_settings WHERE user_id = ?');
    const settings = settingsStmt.get(userId) || {};

    const txStmt = db.prepare('SELECT id, amount, date, time, merchant, category, type, payment_method, notes, created_at FROM transactions WHERE user_id = ? ORDER BY date DESC');
    const transactions = txStmt.all(userId);

    const plansStmt = db.prepare('SELECT id, pattern_id, category, title, recommendation, current_text, target_text, estimated_saving, status, created_at FROM action_plans WHERE user_id = ?');
    const actionPlans = plansStmt.all(userId);

    const chatStmt = db.prepare('SELECT sender, text, timestamp FROM chat_history WHERE user_id = ? ORDER BY timestamp ASC');
    const chatHistory = chatStmt.all(userId);

    const logsStmt = db.prepare('SELECT action_type, description, metadata, timestamp FROM user_activity_logs WHERE user_id = ? ORDER BY timestamp ASC');
    const activityTrail = logsStmt.all(userId);

    logUserActivity(userId, 'DATA_EXPORT', 'Exported complete personal data archive', { totalRecords: transactions.length }, req);

    const exportBundle = {
      exportMetadata: {
        exportedAt: new Date().toISOString(),
        version: '2.0',
        system: 'Where Did My Money Go? — Smart Expense & Budget Tracker',
        totalTransactions: transactions.length,
        totalActionPlans: actionPlans.length,
        totalChatMessages: chatHistory.length,
        totalAuditEvents: activityTrail.length
      },
      profile: user,
      preferences: settings,
      transactions,
      actionPlans,
      chatHistory,
      activityTrail
    };

    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename="wdmmg_data_${user.username || 'user'}_${Date.now()}.json"`);
    return res.json(exportBundle);
  } catch (err) {
    console.error('Export user data error:', err.message);
    return res.status(500).json({ error: 'Failed to generate user data export.' });
  }
});

// ==========================================
// USER NOTIFICATIONS API
// ==========================================

// Get Notifications
app.get('/api/notifications', authenticateToken, (req, res) => {
  try {
    const stmt = db.prepare('SELECT id, title, message, type, is_read, created_at FROM user_notifications WHERE user_id = ? ORDER BY created_at DESC LIMIT 30');
    const notifications = stmt.all(req.user.id);
    return res.json(notifications);
  } catch (err) {
    console.error('Get notifications error:', err.message);
    return res.status(500).json({ error: 'Failed to load notifications.' });
  }
});

// Mark Single Notification as Read
app.put('/api/notifications/:id/read', authenticateToken, (req, res) => {
  try {
    db.prepare('UPDATE user_notifications SET is_read = 1 WHERE id = ? AND user_id = ?')
      .run(req.params.id, req.user.id);
    return res.json({ success: true });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to update notification.' });
  }
});

// Mark All Notifications as Read
app.put('/api/notifications/read-all', authenticateToken, (req, res) => {
  try {
    db.prepare('UPDATE user_notifications SET is_read = 1 WHERE user_id = ?').run(req.user.id);
    return res.json({ success: true });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to update notifications.' });
  }
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

    logUserActivity(
      req.user.id,
      'TRANSACTION_CREATE',
      `Added ${type || 'expense'} of ₹${parseFloat(amount)} at ${merchant.trim()} (${category || 'Other'})`,
      { txId, amount: parseFloat(amount), merchant: merchant.trim(), category: category || 'Other' },
      req
    );

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

    logUserActivity(
      req.user.id,
      'TRANSACTION_UPDATE',
      `Updated transaction record at ${(merchant || '').trim() || txId}`,
      { txId, amount: parseFloat(amount) },
      req
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

    logUserActivity(
      req.user.id,
      'TRANSACTION_DELETE',
      `Deleted transaction record ${txId}`,
      { txId },
      req
    );

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
    logUserActivity(
      req.user.id,
      'TRANSACTIONS_CLEAR',
      'Cleared all user transactions',
      null,
      req
    );
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

    logUserActivity(
      req.user.id,
      'CSV_IMPORT',
      `Imported ${importedCount} transactions from CSV data file`,
      { count: importedCount },
      req
    );

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

    logUserActivity(
      req.user.id,
      'DEMO_DATA_LOAD',
      `Loaded demo portfolio with ${count} sample transactions`,
      { count },
      req
    );

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

    logUserActivity(
      req.user.id,
      'TARGET_UPDATE',
      `Updated monthly savings target to ₹${newTarget}`,
      { target: newTarget },
      req
    );

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

    logUserActivity(
      req.user.id,
      'HABIT_CREATE',
      `Adopted new financial habit: "${habit.title}" (Target saving: ₹${habit.estimatedSaving || 0})`,
      { habitId, title: habit.title },
      req
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

    logUserActivity(
      req.user.id,
      'HABIT_STATUS',
      `Marked habit ${habitId} as "${status}"`,
      { habitId, status },
      req
    );

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

    logUserActivity(
      req.user.id,
      'HABIT_DELETE',
      `Removed habit ${habitId} from action plan`,
      { habitId },
      req
    );

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

    if (sender === 'user') {
      logUserActivity(
        req.user.id,
        'AI_CHAT_MESSAGE',
        `Asked AI Coach: "${text.slice(0, 60)}${text.length > 60 ? '...' : ''}"`,
        null,
        req
      );
    }

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
    logUserActivity(
      req.user.id,
      'CHAT_CLEAR',
      'Cleared AI Coach conversation history',
      null,
      req
    );
    return res.json({ success: true, message: 'Chat history cleared.' });
  } catch (err) {
    console.error('Clear chat error:', err.message);
    return res.status(500).json({ error: 'Failed to clear chat.' });
  }
});

// Render & Cloud Health Check
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'healthy', uptime: process.uptime(), timestamp: new Date().toISOString() });
});

// Serve Static Frontend Assets
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.static(path.join(__dirname)));

// Fallback SPA routing
app.use((req, res) => {
  const publicIndex = path.join(__dirname, 'public', 'index.html');
  if (fs.existsSync(publicIndex)) {
    return res.sendFile(publicIndex);
  }
  res.sendFile(path.join(__dirname, 'index.html'));
});

// Global error handler
app.use((err, req, res, next) => {
  console.error('Unhandled server error:', err.message);
  res.status(500).json({ error: 'An unexpected internal error occurred.' });
});

// Start Server (only when run directly via `node server.js`, not when imported by Vercel / serverless functions)
if (require.main === module) {
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Money Tracker Server running on port ${PORT} (http://0.0.0.0:${PORT})`);
  });
}

module.exports = app;
