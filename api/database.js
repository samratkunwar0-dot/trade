const path = require('path');
const fs = require('fs');

let Database;
try {
    Database = require('better-sqlite3');
} catch (e) {
    console.error('Failed to load better-sqlite3:', e.message);
    // Provide dummy Database to avoid crashing the rest of the script immediately
    Database = class { constructor() { this.exec = () => { }; this.prepare = () => ({ get: () => null, run: () => ({ lastInsertRowid: null }), all: () => [] }); } };
}

const isVercel = process.env.VERCEL || false;
// Need to use /tmp on Vercel otherwise there's an EROFS error
const dbPath = isVercel ? '/tmp/database.sqlite' : path.join(process.cwd(), 'database.sqlite');
const db = new Database(dbPath);

// Ensure tables exist
db.exec(`
    CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT UNIQUE,
        password TEXT,
        role TEXT DEFAULT 'user',
        status TEXT DEFAULT 'At office'
    );
    CREATE TABLE IF NOT EXISTS messages (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        userId INTEGER,
        username TEXT,
        content TEXT,
        mediaType TEXT,
        mediaUrl TEXT,
        timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS notices (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        userId INTEGER,
        username TEXT,
        title TEXT,
        content TEXT,
        mediaUrl TEXT,
        timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
    );
`);

// Migration
try { db.exec(`ALTER TABLE users ADD COLUMN role TEXT DEFAULT 'user'`); } catch (e) { }

// Seed
const users = ['samrat', 'mandira', 'ganesh', 'Tara', 'Sundari', 'Srijana', 'Pramila', 'Roshan', 'Pralad', 'Santosh', 'Sarmila'];
const upsert = db.prepare(`INSERT INTO users (username, password, role) VALUES (?, ?, ?) ON CONFLICT(username) DO UPDATE SET role=excluded.role`);
users.forEach(u => {
    const role = ['samrat'].includes(u) ? 'superadmin' : (['mandira', 'ganesh'].includes(u) ? 'admin' : 'user');
    upsert.run(u, `${u}123`, role);
});

module.exports = {
    getUser: async (username) => db.prepare('SELECT * FROM users WHERE username = ?').get(username),
    updateStatus: async (username, status) => db.prepare('UPDATE users SET status = ? WHERE username = ?').run(status, username),
    getAllUsers: async () => db.prepare('SELECT username, status FROM users').all(),
    saveMessage: async (userId, username, content, mediaType, mediaUrl) => {
        const res = db.prepare('INSERT INTO messages (userId, username, content, mediaType, mediaUrl) VALUES (?, ?, ?, ?, ?)').run(userId, username, content, mediaType, mediaUrl);
        return { lastInsertRowid: res.lastInsertRowid };
    },
    getMessages: async () => db.prepare('SELECT * FROM messages ORDER BY timestamp ASC').all(),
    editMessage: async (id, content) => db.prepare('UPDATE messages SET content = ? WHERE id = ?').run(content, id),
    deleteMessage: async (id) => db.prepare('DELETE FROM messages WHERE id = ?').run(id),
    saveNotice: async (userId, username, title, content, mediaUrl) => db.prepare('INSERT INTO notices (userId, username, title, content, mediaUrl) VALUES (?, ?, ?, ?, ?)').run(userId, username, title, content, mediaUrl),
    getNotices: async () => db.prepare('SELECT * FROM notices ORDER BY timestamp DESC').all()
};
