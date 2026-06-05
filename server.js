const express = require('express');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const DB_PATH = path.join(__dirname, 'data', 'database.json');
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

app.use(express.json({ limit: '1mb' }));

const createRateLimiter = (maxRequests, windowMs) => {
  const requestMap = new Map();
  return (req, res, next) => {
    const key = req.ip || req.connection.remoteAddress || 'unknown';
    const now = Date.now();
    const entry = requestMap.get(key);
    if (!entry || now > entry.resetAt) {
      requestMap.set(key, { count: 1, resetAt: now + windowMs });
      return next();
    }
    entry.count += 1;
    if (entry.count > maxRequests) {
      return res.status(429).json({ error: 'アクセスが多すぎます。しばらく待って再試行してください。' });
    }
    return next();
  };
};

app.use('/api', createRateLimiter(120, 60 * 1000));
app.use('/api/auth', createRateLimiter(30, 60 * 1000));

const ensureDb = () => {
  const dir = path.dirname(DB_PATH);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  if (!fs.existsSync(DB_PATH)) {
    fs.writeFileSync(DB_PATH, JSON.stringify({ users: {}, sessions: {} }, null, 2), 'utf8');
  }
};

const readDb = () => {
  ensureDb();
  const raw = fs.readFileSync(DB_PATH, 'utf8');
  const parsed = JSON.parse(raw || '{}');
  parsed.users = parsed.users || {};
  parsed.sessions = parsed.sessions || {};
  return parsed;
};

const writeDb = (db) => {
  ensureDb();
  fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2), 'utf8');
};

const createPinHash = (pin) => {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(pin, salt, 64).toString('hex');
  return `${salt}:${hash}`;
};

const verifyPin = (pin, storedHash) => {
  if (!storedHash || !storedHash.includes(':')) return false;
  const [salt, originalHash] = storedHash.split(':');
  const candidateHash = crypto.scryptSync(pin, salt, 64).toString('hex');
  const originalBuffer = Buffer.from(originalHash, 'hex');
  const candidateBuffer = Buffer.from(candidateHash, 'hex');
  if (originalBuffer.length !== candidateBuffer.length) return false;
  return crypto.timingSafeEqual(originalBuffer, candidateBuffer);
};

const validateCredentials = (name, pin) => {
  if (!name || typeof name !== 'string' || !name.trim()) return 'プレイヤー名を入力してください。';
  if (!/^\d{4}$/.test(pin || '')) return 'パスワードは4桁の数字で入力してください。';
  return null;
};

const createSession = (db, name) => {
  const token = crypto.randomBytes(32).toString('hex');
  db.sessions[token] = { name, createdAt: Date.now() };
  return token;
};

const getAuthToken = (req) => {
  const authHeader = req.headers.authorization || '';
  if (authHeader.startsWith('Bearer ')) return authHeader.slice(7).trim();
  if (authHeader.startsWith('Token ')) return authHeader.slice(6).trim();
  return '';
};

const authFromToken = (token) => {
  if (!token) return null;
  const db = readDb();
  const session = db.sessions[token];
  if (!session) return null;
  if (!session.createdAt || Date.now() - session.createdAt > SESSION_TTL_MS) {
    delete db.sessions[token];
    writeDb(db);
    return null;
  }
  const user = db.users[session.name];
  if (!user) {
    delete db.sessions[token];
    writeDb(db);
    return null;
  }
  return { db, name: session.name, user };
};

app.post('/api/auth/register', (req, res) => {
  const { name, pin } = req.body || {};
  const error = validateCredentials(name, pin);
  if (error) return res.status(400).json({ error });

  const trimmedName = name.trim();
  const db = readDb();
  if (db.users[trimmedName]) {
    return res.status(409).json({ error: 'この名前は既に登録されています。' });
  }

  db.users[trimmedName] = {
    pinHash: createPinHash(pin),
    matchHistory: [],
    playerDict: {}
  };
  const token = createSession(db, trimmedName);
  writeDb(db);

  res.json({
    name: trimmedName,
    token,
    data: {
      matchHistory: [],
      playerDict: {}
    }
  });
});

app.post('/api/auth/login', (req, res) => {
  const { name, pin } = req.body || {};
  const error = validateCredentials(name, pin);
  if (error) return res.status(400).json({ error });

  const trimmedName = name.trim();
  const db = readDb();
  const user = db.users[trimmedName];
  if (!user || !verifyPin(pin, user.pinHash)) {
    return res.status(401).json({ error: 'プレイヤー名またはパスワードが間違っています。' });
  }

  const token = createSession(db, trimmedName);
  writeDb(db);

  res.json({
    name: trimmedName,
    token,
    data: {
      matchHistory: Array.isArray(user.matchHistory) ? user.matchHistory : [],
      playerDict: user.playerDict && typeof user.playerDict === 'object' ? user.playerDict : {}
    }
  });
});

app.post('/api/auth/logout', (req, res) => {
  const token = getAuthToken(req) || (req.body && req.body.token);
  if (token) {
    const db = readDb();
    delete db.sessions[token];
    writeDb(db);
  }
  res.json({ ok: true });
});

app.get('/api/session', (req, res) => {
  const token = getAuthToken(req);
  const auth = authFromToken(token);
  if (!auth) return res.status(401).json({ error: 'セッションが無効です。' });

  const { name, user } = auth;
  res.json({
    name,
    token,
    data: {
      matchHistory: Array.isArray(user.matchHistory) ? user.matchHistory : [],
      playerDict: user.playerDict && typeof user.playerDict === 'object' ? user.playerDict : {}
    }
  });
});

app.get('/api/user-data', (req, res) => {
  const token = getAuthToken(req);
  const auth = authFromToken(token);
  if (!auth) return res.status(401).json({ error: 'セッションが無効です。' });

  const { user } = auth;
  res.json({
    data: {
      matchHistory: Array.isArray(user.matchHistory) ? user.matchHistory : [],
      playerDict: user.playerDict && typeof user.playerDict === 'object' ? user.playerDict : {}
    }
  });
});

app.put('/api/user-data', (req, res) => {
  const token = getAuthToken(req);
  const auth = authFromToken(token);
  if (!auth) return res.status(401).json({ error: 'セッションが無効です。' });

  const { matchHistory, playerDict } = req.body || {};
  if (!Array.isArray(matchHistory) || !playerDict || typeof playerDict !== 'object' || Array.isArray(playerDict)) {
    return res.status(400).json({ error: '保存データの形式が不正です。' });
  }

  auth.db.users[auth.name].matchHistory = matchHistory;
  auth.db.users[auth.name].playerDict = playerDict;
  writeDb(auth.db);

  res.json({ ok: true });
});

app.get('/', (_req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.get('/index.html', (_req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.get('/jpa-score.html', (_req, res) => {
  res.sendFile(path.join(__dirname, 'jpa-score.html'));
});

app.listen(PORT, () => {
  console.log(`JPA scoreboard server listening on http://localhost:${PORT}`);
});
