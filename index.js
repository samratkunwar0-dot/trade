const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const db = require('./database');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: { origin: "*", methods: ["GET", "POST"] },
    path: '/socket.io'
});

const isVercel = process.env.VERCEL || false;
// Use process.cwd() for root-relative paths
const rootDir = process.cwd();
const uploadDir = isVercel ? '/tmp/uploads' : path.join(rootDir, 'uploads');
const distDir = isVercel ? path.join(rootDir, 'frontend/dist') : path.join(rootDir, 'frontend/dist');

if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, uploadDir),
    filename: (req, file, cb) => cb(null, Date.now() + path.extname(file.originalname))
});
const upload = multer({ storage });

app.use(cors());
app.use(express.json());
app.use('/uploads', express.static(uploadDir));
app.use(express.static(distDir));

// API Routes
app.post('/api/login', async (req, res) => {
    const { username, password } = req.body;
    const user = await db.getUser(username);
    if (user && user.password === password) {
        res.json({ id: user.id, username: user.username, status: user.status, role: user.role });
    } else {
        res.status(401).json({ error: 'Invalid credentials' });
    }
});

app.get('/api/users', async (req, res) => res.json(await db.getAllUsers()));
app.get('/api/messages', async (req, res) => res.json(await db.getMessages()));
app.get('/api/notices', async (req, res) => res.json(await db.getNotices()));

app.post('/api/upload', upload.single('file'), (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
    const mediaUrl = `/uploads/${req.file.filename}`;
    res.json({ url: mediaUrl });
});

// Socket Events
io.on('connection', (socket) => {
    socket.on('sendMessage', async (data) => {
        const { userId, username, content, mediaType, mediaUrl } = data;
        const result = await db.saveMessage(userId, username, content, mediaType, mediaUrl);
        io.emit('receiveMessage', { id: result.lastInsertRowid, userId, username, content, mediaType, mediaUrl, timestamp: new Date().toISOString() });
    });

    socket.on('editMessage', async (data) => {
        const { id, content } = data;
        await db.editMessage(id, content);
        io.emit('messageEdited', { id, content });
    });

    socket.on('deleteMessage', async (id) => {
        await db.deleteMessage(id);
        io.emit('messageDeleted', id);
    });

    socket.on('updateStatus', async (data) => {
        const { username, status } = data;
        await db.updateStatus(username, status);
        io.emit('statusUpdated', { username, status });
    });

    socket.on('sendNotice', async (data) => {
        const { userId, username, title, content, mediaUrl } = data;
        await db.saveNotice(userId, username, title, content, mediaUrl);
        io.emit('noticeReceived', { username, title, content, mediaUrl, timestamp: new Date().toISOString() });
    });
});

// SPA Fallback - Serve index.html for all non-API/uploads routes
app.get('(.*)', (req, res) => {
    if (req.path.startsWith('/api') || req.path.startsWith('/uploads')) {
        return res.status(404).json({ error: 'Not Found' });
    }
    const indexFile = path.join(distDir, 'index.html');
    if (fs.existsSync(indexFile)) {
        res.sendFile(indexFile);
    } else {
        res.status(500).send('Frontend build not found at: ' + indexFile);
    }
});

if (!isVercel) {
    const PORT = 3001;
    server.listen(PORT, () => console.log(`Server running on port ${PORT}\nServing frontend from: ${distDir}`));
}

module.exports = server;
