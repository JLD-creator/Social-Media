// Uso: node seed.js
// Crea un usuario moderador de ejemplo para poder probar el panel de moderacion.
const bcrypt = require('bcryptjs');
const db = require('./db');

const email = 'mod@devspace.com';
const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email);

if (existing) {
  db.prepare("UPDATE users SET role = 'mod' WHERE id = ?").run(existing.id);
  console.log('Usuario ya existia, se ha promovido a moderador:', email);
} else {
  const hash = bcrypt.hashSync('moderador123', 10);
  db.prepare("INSERT INTO users (username, email, password_hash, role, bio) VALUES (?, ?, ?, 'mod', ?)")
    .run('mod', email, hash, 'Moderador de la comunidad');
  console.log('Usuario moderador creado:');
  console.log('  email:', email);
  console.log('  password: moderador123');
}
