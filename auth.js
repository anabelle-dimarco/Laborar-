/**
 * ══════════════════════════════════════════════════════
 *  LaborAr — auth.js
 *  Servidor de autenticación: JWT + SQLite + Google OAuth
 *  Puerto: 3002
 * ══════════════════════════════════════════════════════
 */

require('dotenv').config();
const express     = require('express');
const cors        = require('cors');
const cookieParser = require('cookie-parser');
const bcrypt      = require('bcryptjs');
const jwt         = require('jsonwebtoken');
const Database    = require('better-sqlite3');
const nodemailer  = require('nodemailer');
const crypto      = require('crypto');
const { OAuth2Client } = require('google-auth-library');

const app    = express();
const PORT   = process.env.PORT || 3002;
const DB_PATH = process.env.DB_PATH || './laborar.db';

// ── DB ──────────────────────────────────────────────
const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    name          TEXT    NOT NULL,
    email         TEXT    NOT NULL UNIQUE COLLATE NOCASE,
    password_hash TEXT,
    google_id     TEXT    UNIQUE,
    avatar        TEXT,
    role          TEXT    NOT NULL DEFAULT 'viewer',
    company       TEXT,
    verified      INTEGER NOT NULL DEFAULT 0,
    created_at    TEXT    NOT NULL DEFAULT (datetime('now')),
    last_login    TEXT
  );

  CREATE TABLE IF NOT EXISTS refresh_tokens (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash TEXT    NOT NULL UNIQUE,
    expires_at TEXT    NOT NULL,
    remember   INTEGER NOT NULL DEFAULT 0,
    created_at TEXT    NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS password_resets (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash TEXT    NOT NULL UNIQUE,
    expires_at TEXT    NOT NULL,
    used       INTEGER NOT NULL DEFAULT 0,
    created_at TEXT    NOT NULL DEFAULT (datetime('now'))
  );
`);

// ── MIDDLEWARE ───────────────────────────────────────
const FRONTEND = process.env.FRONTEND_URL || 'http://localhost';

app.use(cors({
  origin: [FRONTEND, 'http://localhost', 'http://127.0.0.1', /^http:\/\/localhost:\d+$/],
  credentials: true,
  methods: ['GET','POST','PUT','DELETE','OPTIONS'],
}));
app.use(express.json());
app.use(cookieParser());

// ── JWT HELPERS ──────────────────────────────────────
const JWT_SECRET         = process.env.JWT_SECRET || 'dev_secret_CHANGE_ME';
const JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || 'dev_refresh_CHANGE_ME';

function signAccess(user) {
  return jwt.sign(
    { id: user.id, email: user.email, name: user.name, role: user.role },
    JWT_SECRET,
    { expiresIn: '15m' }
  );
}

function signRefresh(user, remember) {
  const expiresIn = remember ? '30d' : '7d';
  return jwt.sign({ id: user.id }, JWT_REFRESH_SECRET, { expiresIn });
}

function setRefreshCookie(res, token, remember) {
  const maxAge = remember ? 30 * 24 * 60 * 60 * 1000 : 7 * 24 * 60 * 60 * 1000;
  res.cookie('refresh_token', token, {
    httpOnly: true,
    secure:   process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge,
    path: '/auth',
  });
}

function authMiddleware(req, res, next) {
  const header = req.headers.authorization || '';
  const token  = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'No autorizado' });
  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch (e) {
    res.status(401).json({ error: 'Token inválido o expirado' });
  }
}

// ── EMAIL ────────────────────────────────────────────
let transporter = null;
if (process.env.SMTP_USER) {
  transporter = nodemailer.createTransport({
    host:   process.env.SMTP_HOST || 'smtp.gmail.com',
    port:   parseInt(process.env.SMTP_PORT) || 587,
    secure: false,
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });
}

async function sendResetEmail(email, name, resetUrl) {
  if (!transporter) {
    console.log('[DEV] Reset URL:', resetUrl);
    return;
  }
  await transporter.sendMail({
    from:    process.env.SMTP_FROM || '"LaborAr" <no-reply@laborar.com>',
    to:      email,
    subject: 'Recuperá tu contraseña — LaborAr',
    html: `
      <div style="font-family:sans-serif;max-width:480px;margin:0 auto;background:#07090f;color:#dde1ed;padding:2rem;border-radius:12px">
        <h1 style="font-size:1.4rem;margin-bottom:0.5rem">Hola, ${name} 👋</h1>
        <p style="color:#5a6478;margin-bottom:1.5rem">Recibimos una solicitud para restablecer tu contraseña en LaborAr.</p>
        <a href="${resetUrl}" style="display:inline-block;background:#00e5a0;color:#000;font-weight:700;padding:0.75rem 1.5rem;border-radius:8px;text-decoration:none">
          Restablecer contraseña →
        </a>
        <p style="margin-top:1.5rem;font-size:0.8rem;color:#5a6478">
          Este enlace expira en 1 hora. Si no solicitaste esto, ignorá este email.
        </p>
      </div>
    `,
  });
}

// ── GOOGLE OAUTH ─────────────────────────────────────
const googleClient = new OAuth2Client(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  process.env.GOOGLE_REDIRECT_URI || `http://localhost:${PORT}/auth/google/callback`
);

// ════════════════════════════════════════════════════
//  RUTAS
// ════════════════════════════════════════════════════

// POST /auth/register
app.post('/auth/register', async (req, res) => {
  try {
    const { name, email, password, company } = req.body;
    if (!name || !email || !password)
      return res.status(400).json({ error: 'Nombre, email y contraseña son requeridos' });

    const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
    if (existing)
      return res.status(409).json({ error: 'Ya existe una cuenta con ese email' });

    if (password.length < 8)
      return res.status(400).json({ error: 'La contraseña debe tener al menos 8 caracteres' });

    const hash = await bcrypt.hash(password, 12);
    const result = db.prepare(
      'INSERT INTO users (name, email, password_hash, company, verified) VALUES (?, ?, ?, ?, 1)'
    ).run(name.trim(), email.toLowerCase().trim(), hash, company || null);

    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(result.lastInsertRowid);
    const access  = signAccess(user);
    const refresh = signRefresh(user, false);
    const rHash   = crypto.createHash('sha256').update(refresh).digest('hex');
    const exp     = new Date(Date.now() + 7 * 86400000).toISOString();
    db.prepare('INSERT INTO refresh_tokens (user_id, token_hash, expires_at) VALUES (?, ?, ?)')
      .run(user.id, rHash, exp);

    setRefreshCookie(res, refresh, false);
    db.prepare("UPDATE users SET last_login = datetime('now') WHERE id = ?").run(user.id);

    res.json({
      access_token: access,
      user: { id: user.id, name: user.name, email: user.email, role: user.role, company: user.company }
    });
  } catch (e) {
    console.error('Register error:', e);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// POST /auth/login
app.post('/auth/login', async (req, res) => {
  try {
    const { email, password, remember } = req.body;
    if (!email || !password)
      return res.status(400).json({ error: 'Email y contraseña requeridos' });

    const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email.toLowerCase().trim());
    if (!user || !user.password_hash)
      return res.status(401).json({ error: 'Email o contraseña incorrectos' });

    const ok = await bcrypt.compare(password, user.password_hash);
    if (!ok)
      return res.status(401).json({ error: 'Email o contraseña incorrectos' });

    const access  = signAccess(user);
    const refresh = signRefresh(user, !!remember);
    const rHash   = crypto.createHash('sha256').update(refresh).digest('hex');
    const days    = remember ? 30 : 7;
    const exp     = new Date(Date.now() + days * 86400000).toISOString();
    db.prepare('INSERT INTO refresh_tokens (user_id, token_hash, expires_at, remember) VALUES (?, ?, ?, ?)')
      .run(user.id, rHash, exp, remember ? 1 : 0);

    setRefreshCookie(res, refresh, !!remember);
    db.prepare("UPDATE users SET last_login = datetime('now') WHERE id = ?").run(user.id);

    res.json({
      access_token: access,
      user: { id: user.id, name: user.name, email: user.email, role: user.role, company: user.company }
    });
  } catch (e) {
    console.error('Login error:', e);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// POST /auth/refresh  — renovar access token
app.post('/auth/refresh', (req, res) => {
  const token = req.cookies.refresh_token;
  if (!token)
    return res.status(401).json({ error: 'Sin refresh token' });
  try {
    const payload = jwt.verify(token, JWT_REFRESH_SECRET);
    const hash    = crypto.createHash('sha256').update(token).digest('hex');
    const row     = db.prepare(
      "SELECT * FROM refresh_tokens WHERE token_hash = ? AND expires_at > datetime('now')"
    ).get(hash);
    if (!row)
      return res.status(401).json({ error: 'Refresh token inválido o expirado' });

    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(payload.id);
    if (!user) return res.status(401).json({ error: 'Usuario no encontrado' });

    const newAccess = signAccess(user);
    res.json({ access_token: newAccess });
  } catch (e) {
    res.status(401).json({ error: 'Refresh token inválido' });
  }
});

// POST /auth/logout
app.post('/auth/logout', (req, res) => {
  const token = req.cookies.refresh_token;
  if (token) {
    const hash = crypto.createHash('sha256').update(token).digest('hex');
    db.prepare('DELETE FROM refresh_tokens WHERE token_hash = ?').run(hash);
  }
  res.clearCookie('refresh_token', { path: '/auth' });
  res.json({ ok: true });
});

// GET /auth/me
app.get('/auth/me', authMiddleware, (req, res) => {
  const user = db.prepare('SELECT id,name,email,role,company,avatar,created_at FROM users WHERE id = ?').get(req.user.id);
  if (!user) return res.status(404).json({ error: 'Usuario no encontrado' });
  res.json({ user });
});

// POST /auth/forgot-password
app.post('/auth/forgot-password', async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ error: 'Email requerido' });

    const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email.toLowerCase().trim());
    // Siempre OK para no revelar si el email existe
    if (!user) return res.json({ ok: true });

    // Token aleatorio de 32 bytes
    const rawToken = crypto.randomBytes(32).toString('hex');
    const hash     = crypto.createHash('sha256').update(rawToken).digest('hex');
    const exp      = new Date(Date.now() + 60 * 60 * 1000).toISOString(); // 1 hora

    db.prepare('DELETE FROM password_resets WHERE user_id = ?').run(user.id);
    db.prepare('INSERT INTO password_resets (user_id, token_hash, expires_at) VALUES (?, ?, ?)')
      .run(user.id, hash, exp);

    const resetUrl = `${process.env.FRONTEND_URL || 'http://localhost'}#reset-password?token=${rawToken}&id=${user.id}`;
    await sendResetEmail(user.email, user.name, resetUrl);

    res.json({ ok: true });
  } catch (e) {
    console.error('Forgot password error:', e);
    res.status(500).json({ error: 'Error enviando email' });
  }
});

// POST /auth/reset-password
app.post('/auth/reset-password', async (req, res) => {
  try {
    const { user_id, token, password } = req.body;
    if (!user_id || !token || !password)
      return res.status(400).json({ error: 'Datos incompletos' });

    if (password.length < 8)
      return res.status(400).json({ error: 'La contraseña debe tener al menos 8 caracteres' });

    const hash = crypto.createHash('sha256').update(token).digest('hex');
    const row  = db.prepare(
      "SELECT * FROM password_resets WHERE user_id = ? AND token_hash = ? AND expires_at > datetime('now') AND used = 0"
    ).get(user_id, hash);

    if (!row) return res.status(400).json({ error: 'Token inválido o expirado' });

    const newHash = await bcrypt.hash(password, 12);
    db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(newHash, user_id);
    db.prepare('UPDATE password_resets SET used = 1 WHERE id = ?').run(row.id);
    db.prepare('DELETE FROM refresh_tokens WHERE user_id = ?').run(user_id);

    res.json({ ok: true });
  } catch (e) {
    console.error('Reset password error:', e);
    res.status(500).json({ error: 'Error restableciendo contraseña' });
  }
});

// ── GOOGLE OAUTH ─────────────────────────────────────

// GET /auth/google  — redirige a Google
app.get('/auth/google', (req, res) => {
  if (!process.env.GOOGLE_CLIENT_ID)
    return res.status(501).json({ error: 'Google OAuth no configurado. Completá GOOGLE_CLIENT_ID en .env' });

  const url = googleClient.generateAuthUrl({
    access_type: 'offline',
    scope: ['profile', 'email'],
    prompt: 'select_account',
    state: req.query.remember || '0',
  });
  res.redirect(url);
});

// GET /auth/google/callback
app.get('/auth/google/callback', async (req, res) => {
  const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost';
  try {
    const { code, state } = req.query;
    const { tokens } = await googleClient.getToken(code);
    googleClient.setCredentials(tokens);

    const ticket = await googleClient.verifyIdToken({
      idToken:  tokens.id_token,
      audience: process.env.GOOGLE_CLIENT_ID,
    });
    const payload = ticket.getPayload();
    const { sub: googleId, email, name, picture } = payload;

    // Buscar usuario existente
    let user = db.prepare('SELECT * FROM users WHERE google_id = ? OR email = ?').get(googleId, email.toLowerCase());

    if (!user) {
      // Crear usuario nuevo
      const result = db.prepare(
        'INSERT INTO users (name, email, google_id, avatar, verified) VALUES (?, ?, ?, ?, 1)'
      ).run(name, email.toLowerCase(), googleId, picture || null);
      user = db.prepare('SELECT * FROM users WHERE id = ?').get(result.lastInsertRowid);
    } else if (!user.google_id) {
      // Vincular cuenta existente con Google
      db.prepare('UPDATE users SET google_id = ?, avatar = ? WHERE id = ?').run(googleId, picture || user.avatar, user.id);
      user = db.prepare('SELECT * FROM users WHERE id = ?').get(user.id);
    }

    const remember = state === '1';
    const access   = signAccess(user);
    const refresh  = signRefresh(user, remember);
    const rHash    = crypto.createHash('sha256').update(refresh).digest('hex');
    const days     = remember ? 30 : 7;
    const exp      = new Date(Date.now() + days * 86400000).toISOString();
    db.prepare('INSERT INTO refresh_tokens (user_id, token_hash, expires_at, remember) VALUES (?, ?, ?, ?)')
      .run(user.id, rHash, exp, remember ? 1 : 0);

    setRefreshCookie(res, refresh, remember);
    db.prepare("UPDATE users SET last_login = datetime('now') WHERE id = ?").run(user.id);

    // Redirigir al frontend con el access token en hash
    res.redirect(`${FRONTEND_URL}#auth-callback?token=${access}`);
  } catch (e) {
    console.error('Google OAuth error:', e);
    res.redirect(`${process.env.FRONTEND_URL || 'http://localhost'}#login?error=google`);
  }
});

// ── PROXY GROQ (del servidor.js original) ────────────
const Groq = (() => { try { return require('groq-sdk'); } catch { return null; } })();

app.post('/chat', async (req, res) => {
  const { messages, apiKey } = req.body;
  const key = apiKey || process.env.GROQ_API_KEY;
  if (!key) return res.status(400).json({ error: { message: 'API Key de Groq no configurada' } });
  if (!Groq) return res.status(500).json({ error: { message: 'groq-sdk no instalado' } });
  try {
    const groq   = new Groq({ apiKey: key });
    const result = await groq.chat.completions.create({
      model:    'llama-3.3-70b-versatile',
      messages: [
        { role: 'system', content: 'Sos Aria, el agente de ventas de LaborAr. Respondés preguntas sobre la plataforma de onboarding, precios, integraciones y demos. Usás español rioplatense, sos amable y profesional.' },
        ...messages,
      ],
      max_tokens: 600,
      temperature: 0.7,
    });
    res.json(result);
  } catch (e) {
    res.status(500).json({ error: { message: e.message } });
  }
});

// ── HEALTH ───────────────────────────────────────────
app.get('/health', (req, res) => res.json({ ok: true, time: new Date().toISOString() }));

// ── START ─────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`\n╔══════════════════════════════════════╗`);
  console.log(`║  LaborAr Auth Server — Puerto ${PORT}  ║`);
  console.log(`╠══════════════════════════════════════╣`);
  console.log(`║  POST /auth/login                    ║`);
  console.log(`║  POST /auth/register                 ║`);
  console.log(`║  POST /auth/refresh                  ║`);
  console.log(`║  POST /auth/logout                   ║`);
  console.log(`║  POST /auth/forgot-password          ║`);
  console.log(`║  POST /auth/reset-password           ║`);
  console.log(`║  GET  /auth/google                   ║`);
  console.log(`║  GET  /auth/me                       ║`);
  console.log(`║  POST /chat  (Groq proxy)            ║`);
  console.log(`╚══════════════════════════════════════╝\n`);

  if (process.env.JWT_SECRET === 'dev_secret_CHANGE_ME')
    console.warn('⚠️  ADVERTENCIA: Usando JWT_SECRET de desarrollo. Configurá el .env en producción.\n');
});
