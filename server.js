require('dotenv').config();
const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('./db');

const app = express();
const PORT = process.env.PORT || 3001;
const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-cambia-esto-en-produccion';
const PAGE_SIZE = 10;

app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// ---------- Middleware ----------
function auth(req, res, next) {
  const header = req.headers.authorization;
  if (!header) return res.status(401).json({ error: 'No autenticado' });
  try {
    const payload = jwt.verify(header.split(' ')[1], JWT_SECRET);
    req.userId = payload.userId;
    req.role = payload.role;
    next();
  } catch {
    return res.status(401).json({ error: 'Token invalido o expirado' });
  }
}

// Autenticacion opcional: si hay token lo decodifica, si no, sigue como anonimo
function optionalAuth(req, res, next) {
  const header = req.headers.authorization;
  if (header) {
    try {
      const payload = jwt.verify(header.split(' ')[1], JWT_SECRET);
      req.userId = payload.userId;
    } catch { /* token invalido, seguimos como anonimo */ }
  }
  next();
}

function requireMod(req, res, next) {
  const user = db.prepare('SELECT role FROM users WHERE id = ?').get(req.userId);
  if (!user || user.role !== 'mod') return res.status(403).json({ error: 'Solo moderadores' });
  next();
}

// ---------- AUTH ----------
app.post('/api/auth/register', (req, res) => {
  const { username, email, password, bio } = req.body;
  if (!username || !email || !password || password.length < 6) {
    return res.status(400).json({ error: 'Datos invalidos. La contrasena debe tener al menos 6 caracteres.' });
  }
  const existing = db.prepare('SELECT id FROM users WHERE email = ? OR username = ?').get(email, username);
  if (existing) return res.status(409).json({ error: 'Ese email o nombre de usuario ya existe' });

  const hash = bcrypt.hashSync(password, 10);
  const info = db.prepare('INSERT INTO users (username, email, password_hash, bio) VALUES (?, ?, ?, ?)')
    .run(username, email, hash, bio || '');

  const token = jwt.sign({ userId: info.lastInsertRowid, role: 'user' }, JWT_SECRET, { expiresIn: '7d' });
  res.json({ token, user: { id: info.lastInsertRowid, username, email, role: 'user' } });
});

app.post('/api/auth/login', (req, res) => {
  const { email, password } = req.body;
  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
  if (!user || !bcrypt.compareSync(password, user.password_hash)) {
    return res.status(401).json({ error: 'Credenciales incorrectas' });
  }
  const token = jwt.sign({ userId: user.id, role: user.role }, JWT_SECRET, { expiresIn: '7d' });
  res.json({ token, user: { id: user.id, username: user.username, email: user.email, role: user.role } });
});

app.get('/api/auth/me', auth, (req, res) => {
  const user = db.prepare('SELECT id, username, email, bio, role FROM users WHERE id = ?').get(req.userId);
  res.json(user);
});

// ---------- POSTS (feed con paginacion) ----------
app.get('/api/posts', optionalAuth, (req, res) => {
  const page = parseInt(req.query.page || '1');
  const tag = req.query.tag;
  const search = req.query.search;
  const offset = (page - 1) * PAGE_SIZE;

  let where = 'WHERE p.is_removed = 0';
  const params = [];
  if (tag) { where += ' AND p.tag = ?'; params.push(tag); }
  if (search) { where += ' AND (p.title LIKE ? OR p.content LIKE ?)'; params.push(`%${search}%`, `%${search}%`); }

  const posts = db.prepare(`
    SELECT p.id, p.title, p.content, p.tag, p.created_at,
           u.id as author_id, u.username as author,
           (SELECT COUNT(*) FROM likes WHERE post_id = p.id) as like_count,
           (SELECT COUNT(*) FROM comments WHERE post_id = p.id) as comment_count
    FROM posts p JOIN users u ON p.user_id = u.id
    ${where}
    ORDER BY p.created_at DESC
    LIMIT ? OFFSET ?
  `).all(...params, PAGE_SIZE, offset);

  if (req.userId) {
    const likedIds = new Set(
      db.prepare('SELECT post_id FROM likes WHERE user_id = ?').all(req.userId).map(r => r.post_id)
    );
    posts.forEach(p => { p.liked_by_me = likedIds.has(p.id); });
  } else {
    posts.forEach(p => { p.liked_by_me = false; });
  }

  const total = db.prepare(`SELECT COUNT(*) as c FROM posts p ${where}`).get(...params).c;

  res.json({ posts, page, totalPages: Math.ceil(total / PAGE_SIZE), total });
});

app.get('/api/posts/:id', optionalAuth, (req, res) => {
  const post = db.prepare(`
    SELECT p.*, u.username as author, u.id as author_id,
      (SELECT COUNT(*) FROM likes WHERE post_id = p.id) as like_count
    FROM posts p JOIN users u ON p.user_id = u.id WHERE p.id = ?
  `).get(req.params.id);
  if (!post || post.is_removed) return res.status(404).json({ error: 'Post no encontrado' });

  let liked = false;
  if (req.userId) {
    liked = !!db.prepare('SELECT 1 FROM likes WHERE user_id = ? AND post_id = ?').get(req.userId, post.id);
  }

  const comments = db.prepare(`
    SELECT c.*, u.username as author FROM comments c
    JOIN users u ON c.user_id = u.id WHERE c.post_id = ? ORDER BY c.created_at ASC
  `).all(req.params.id);

  res.json({ ...post, liked, comments: buildCommentTree(comments) });
});

function buildCommentTree(flat) {
  const map = {};
  const roots = [];
  flat.forEach(c => { map[c.id] = { ...c, replies: [] }; });
  flat.forEach(c => {
    if (c.parent_comment_id && map[c.parent_comment_id]) {
      map[c.parent_comment_id].replies.push(map[c.id]);
    } else {
      roots.push(map[c.id]);
    }
  });
  return roots;
}

app.post('/api/posts', auth, (req, res) => {
  const { title, content, tag } = req.body;
  if (!title || !content) return res.status(400).json({ error: 'Titulo y contenido son obligatorios' });
  const info = db.prepare('INSERT INTO posts (user_id, title, content, tag) VALUES (?, ?, ?, ?)')
    .run(req.userId, title, content, tag || 'general');
  res.json({ id: info.lastInsertRowid });
});

app.delete('/api/posts/:id', auth, (req, res) => {
  const post = db.prepare('SELECT user_id FROM posts WHERE id = ?').get(req.params.id);
  if (!post) return res.status(404).json({ error: 'No encontrado' });
  const user = db.prepare('SELECT role FROM users WHERE id = ?').get(req.userId);
  if (post.user_id !== req.userId && user.role !== 'mod') {
    return res.status(403).json({ error: 'No tienes permiso para borrar este post' });
  }
  db.prepare('DELETE FROM posts WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

// ---------- LIKES (toggle, con constraint unico en BD) ----------
app.post('/api/posts/:id/like', auth, (req, res) => {
  const existing = db.prepare('SELECT 1 FROM likes WHERE user_id = ? AND post_id = ?').get(req.userId, req.params.id);
  if (existing) {
    db.prepare('DELETE FROM likes WHERE user_id = ? AND post_id = ?').run(req.userId, req.params.id);
  } else {
    db.prepare('INSERT INTO likes (user_id, post_id) VALUES (?, ?)').run(req.userId, req.params.id);
  }
  const count = db.prepare('SELECT COUNT(*) as c FROM likes WHERE post_id = ?').get(req.params.id).c;
  res.json({ liked: !existing, like_count: count });
});

// ---------- COMENTARIOS (anidados) ----------
app.post('/api/posts/:id/comments', auth, (req, res) => {
  const { content, parent_comment_id } = req.body;
  if (!content) return res.status(400).json({ error: 'El comentario no puede estar vacio' });
  const info = db.prepare('INSERT INTO comments (post_id, user_id, parent_comment_id, content) VALUES (?, ?, ?, ?)')
    .run(req.params.id, req.userId, parent_comment_id || null, content);
  res.json({ id: info.lastInsertRowid });
});

app.delete('/api/comments/:id', auth, (req, res) => {
  const comment = db.prepare('SELECT user_id FROM comments WHERE id = ?').get(req.params.id);
  if (!comment) return res.status(404).json({ error: 'No encontrado' });
  const user = db.prepare('SELECT role FROM users WHERE id = ?').get(req.userId);
  if (comment.user_id !== req.userId && user.role !== 'mod') {
    return res.status(403).json({ error: 'No tienes permiso' });
  }
  db.prepare('DELETE FROM comments WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

// ---------- PERFILES / FOLLOWS ----------
app.get('/api/users/:username', optionalAuth, (req, res) => {
  const user = db.prepare('SELECT id, username, bio, role, created_at FROM users WHERE username = ?').get(req.params.username);
  if (!user) return res.status(404).json({ error: 'Usuario no encontrado' });

  const posts = db.prepare(`
    SELECT p.id, p.title, p.tag, p.created_at,
      (SELECT COUNT(*) FROM likes WHERE post_id = p.id) as like_count
    FROM posts p WHERE p.user_id = ? AND p.is_removed = 0 ORDER BY p.created_at DESC
  `).all(user.id);

  const followers = db.prepare('SELECT COUNT(*) as c FROM follows WHERE followed_id = ?').get(user.id).c;
  const following = db.prepare('SELECT COUNT(*) as c FROM follows WHERE follower_id = ?').get(user.id).c;
  let isFollowing = false;
  if (req.userId) {
    isFollowing = !!db.prepare('SELECT 1 FROM follows WHERE follower_id = ? AND followed_id = ?').get(req.userId, user.id);
  }

  res.json({ ...user, posts, followers, following, isFollowing });
});

app.post('/api/users/:username/follow', auth, (req, res) => {
  const target = db.prepare('SELECT id FROM users WHERE username = ?').get(req.params.username);
  if (!target) return res.status(404).json({ error: 'Usuario no encontrado' });
  if (target.id === req.userId) return res.status(400).json({ error: 'No puedes seguirte a ti mismo' });

  const existing = db.prepare('SELECT 1 FROM follows WHERE follower_id = ? AND followed_id = ?').get(req.userId, target.id);
  if (existing) {
    db.prepare('DELETE FROM follows WHERE follower_id = ? AND followed_id = ?').run(req.userId, target.id);
  } else {
    db.prepare('INSERT INTO follows (follower_id, followed_id) VALUES (?, ?)').run(req.userId, target.id);
  }
  res.json({ following: !existing });
});

// ---------- MODERACION ----------
app.post('/api/posts/:id/report', auth, (req, res) => {
  const { reason } = req.body;
  db.prepare('INSERT INTO reports (post_id, reporter_id, reason) VALUES (?, ?, ?)').run(req.params.id, req.userId, reason || '');
  res.json({ ok: true });
});

app.get('/api/mod/reports', auth, requireMod, (req, res) => {
  const reports = db.prepare(`
    SELECT r.*, p.title as post_title, u.username as reporter
    FROM reports r JOIN posts p ON r.post_id = p.id JOIN users u ON r.reporter_id = u.id
    ORDER BY r.created_at DESC
  `).all();
  res.json(reports);
});

app.post('/api/mod/posts/:id/remove', auth, requireMod, (req, res) => {
  db.prepare('UPDATE posts SET is_removed = 1 WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

app.listen(PORT, () => console.log(`DevSpace corriendo en http://localhost:${PORT}`));
