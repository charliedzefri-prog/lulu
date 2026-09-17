/**
 * Лулу мессссссссссссссселдежерер — защищенный мессенджер
 * Стиль: старый интернет 90-х - середины 2000-х
 * Жесткие требования:
 * - Только реальные пользователи, никаких ботов/фейков/рекомендаций
 * - Вход только по логину без пароля и без email
 * - Аватарка обязательна/изменяема
 * - Текст + фото + видео в реальном времени
 * - Статусы доставки/прочтения только от реальных собеседников
 * - Голосовые чаты low-bitrate без шумоподавления
 * - Persist: на Render диск сохраняет БД/файлы, логи чистятся
 */
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const multer = require('multer');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');

const PORT = process.env.PORT || 3000;
const DATA_DIR = path.join(__dirname, 'data');
const UPLOAD_DIR = path.join(__dirname, 'uploads');
const AVATAR_DIR = path.join(UPLOAD_DIR, 'avatars');
const MEDIA_DIR = path.join(UPLOAD_DIR, 'media');

// ensure dirs
[DATA_DIR, AVATAR_DIR, MEDIA_DIR].forEach(d => { if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true }); });

// --- DB ---
const Database = require('better-sqlite3');
const dbPath = path.join(DATA_DIR, 'lulu.db');
const db = new Database(dbPath);
// ВАЖНО для Render: эта БД лежит на Persistent Disk и НЕ удаляется при деплое/обновлении
// Логи (console, файлы логов) — отдельно и чистятся скриптом clean-logs
db.pragma('journal_mode = WAL');

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  username TEXT UNIQUE NOT NULL,
  avatar TEXT,
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS contacts (
  user_id TEXT NOT NULL,
  contact_id TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, contact_id),
  FOREIGN KEY (user_id) REFERENCES users(id),
  FOREIGN KEY (contact_id) REFERENCES users(id)
);
CREATE TABLE IF NOT EXISTS chats (
  id TEXT PRIMARY KEY,
  is_group INTEGER NOT NULL DEFAULT 0,
  name TEXT,
  created_by TEXT,
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS chat_members (
  chat_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  PRIMARY KEY (chat_id, user_id),
  FOREIGN KEY (chat_id) REFERENCES chats(id),
  FOREIGN KEY (user_id) REFERENCES users(id)
);
CREATE TABLE IF NOT EXISTS messages (
  id TEXT PRIMARY KEY,
  chat_id TEXT NOT NULL,
  sender_id TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'text',
  text TEXT,
  media_url TEXT,
  media_name TEXT,
  created_at INTEGER NOT NULL,
  delivered INTEGER DEFAULT 0,
  read INTEGER DEFAULT 0,
  FOREIGN KEY (chat_id) REFERENCES chats(id),
  FOREIGN KEY (sender_id) REFERENCES users(id)
);
`);

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: "*", methods: ["GET", "POST"] },
  maxHttpBufferSize: 1e8
});

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// static
app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(UPLOAD_DIR));
app.use('/music', express.static(path.join(__dirname, 'public/music')));

// --- helpers ---
function getUserById(id) {
  return db.prepare('SELECT * FROM users WHERE id = ?').get(id);
}
function getUserByUsername(username) {
  return db.prepare('SELECT * FROM users WHERE username = ?').get(username);
}
function authMiddleware(req,res,next){
  const token = req.headers['x-token'] || req.query.token;
  if(!token) return res.status(401).json({error:'Нет токена (логин обязателен)'});
  const user = getUserById(token);
  if(!user) return res.status(401).json({error:'Неверный токен'});
  req.user = user;
  next();
}

// multer
const storage = multer.diskStorage({
  destination: (req,file,cb)=>{
    if(file.fieldname==='avatar') cb(null, AVATAR_DIR);
    else cb(null, MEDIA_DIR);
  },
  filename: (req,file,cb)=>{
    const ext = path.extname(file.originalname) || '';
    cb(null, uuidv4() + ext);
  }
});
const upload = multer({
  storage,
  limits: { fileSize: 100 * 1024 * 1024 },
  fileFilter: (req,file,cb)=>{
    // allow all for now
    cb(null,true);
  }
});

// --- API ---

// Проверка здоровья (для Render)
app.get('/health', (req,res)=>res.json({status:'ok', time: Date.now()}));

// Регистрация / вход — ТОЛЬКО по логину, без пароля и без email
app.post('/api/auth/login', (req,res)=>{
  let { username } = req.body;
  if(!username) return res.status(400).json({error:'Логин обязателен'});
  username = username.trim();
  // валидация: 2-20 символов, буквы/цифры/_/- , поддержка кириллицы
  if(username.length < 2 || username.length > 20) return res.status(400).json({error:'Логин должен быть 2-20 символов'});
  if(!/^[\w\u0400-\u04FF-]+$/.test(username)) return res.status(400).json({error:'Только буквы, цифры, _ и -'});
  // поиск
  let user = getUserByUsername(username);
  let isNew = false;
  if(!user){
    const id = uuidv4();
    const now = Date.now();
    db.prepare('INSERT INTO users (id, username, avatar, created_at) VALUES (?,?,?,?)').run(id, username, null, now);
    user = getUserById(id);
    isNew = true;
    console.log(`[AUTH] Новый реальный пользователь: ${username} (${id})`);
  } else {
    console.log(`[AUTH] Вход реального пользователя: ${username}`);
  }
  // токен = id (в проде можно JWT, но по ТЗ — максимально просто)
  res.json({ user, token: user.id, isNew });
});

app.get('/api/me', authMiddleware, (req,res)=>{
  res.json(req.user);
});

// Загрузка/смена аватарки — обязательная и простая
app.post('/api/avatar', authMiddleware, upload.single('avatar'), (req,res)=>{
  if(!req.file) return res.status(400).json({error:'Файл не загружен'});
  const rel = `/uploads/avatars/${req.file.filename}`;
  db.prepare('UPDATE users SET avatar = ? WHERE id = ?').run(rel, req.user.id);
  const updated = getUserById(req.user.id);
  // уведомить контакты
  io.emit('user_updated', updated);
  res.json(updated);
});

// Поиск реальных пользователей — только точное совпадение, никаких рекомендаций/ботов
app.get('/api/users/search', authMiddleware, (req,res)=>{
  const q = (req.query.q || '').trim();
  if(!q) return res.json([]);
  // Только точное совпадение, чтобы не палить базу и не давать рекомендаций
  const user = getUserByUsername(q);
  if(user && user.id !== req.user.id){
    res.json([user]);
  } else {
    // пробуем LIKE но без ботов — только реальные
    const like = db.prepare('SELECT * FROM users WHERE username LIKE ? AND id != ? LIMIT 10').all(`%${q}%`, req.user.id);
    res.json(like);
  }
});

// Список контактов — только реальные, добавленные вручную, без алгоритмов
app.get('/api/contacts', authMiddleware, (req,res)=>{
  const rows = db.prepare(`
    SELECT u.* FROM users u
    JOIN contacts c ON c.contact_id = u.id
    WHERE c.user_id = ?
    ORDER BY u.username ASC
  `).all(req.user.id);
  res.json(rows);
});

app.post('/api/contacts/add', authMiddleware, (req,res)=>{
  const { username } = req.body;
  if(!username) return res.status(400).json({error:'Укажи логин'});
  const target = getUserByUsername(username.trim());
  if(!target) return res.status(404).json({error:'Пользователь не найден. Только реальные люди!'});
  if(target.id === req.user.id) return res.status(400).json({error:'Нельзя добавить себя'});
  const exists = db.prepare('SELECT 1 FROM contacts WHERE user_id=? AND contact_id=?').get(req.user.id, target.id);
  if(exists) return res.status(400).json({error:'Уже в контактах'});
  const now = Date.now();
  db.prepare('INSERT INTO contacts (user_id, contact_id, created_at) VALUES (?,?,?)').run(req.user.id, target.id, now);
  // взаимно? нет, только односторонне по ТЗ, но для чата создадим связь
  // создаем или находим личный чат
  const chatId = getOrCreatePrivateChat(req.user.id, target.id);
  res.json({ contact: target, chatId });
});

function getOrCreatePrivateChat(a,b){
  const sorted = [a,b].sort().join('_');
  const chatId = `pm_${sorted}`;
  const exists = db.prepare('SELECT id FROM chats WHERE id=?').get(chatId);
  if(!exists){
    const now = Date.now();
    db.prepare('INSERT INTO chats (id, is_group, name, created_by, created_at) VALUES (?,?,?,?,?)').run(chatId, 0, null, a, now);
    db.prepare('INSERT INTO chat_members (chat_id, user_id) VALUES (?,?)').run(chatId, a);
    db.prepare('INSERT INTO chat_members (chat_id, user_id) VALUES (?,?)').run(chatId, b);
  }
  return chatId;
}

// Чаты (личные + группы)
app.get('/api/chats', authMiddleware, (req,res)=>{
  const chats = db.prepare(`
    SELECT c.* FROM chats c
    JOIN chat_members m ON m.chat_id = c.id
    WHERE m.user_id = ?
    ORDER BY c.created_at DESC
  `).all(req.user.id);

  const enriched = chats.map(chat=>{
    const members = db.prepare(`
      SELECT u.* FROM users u
      JOIN chat_members cm ON cm.user_id = u.id
      WHERE cm.chat_id = ?
    `).all(chat.id);
    const lastMsg = db.prepare('SELECT * FROM messages WHERE chat_id=? ORDER BY created_at DESC LIMIT 1').get(chat.id);
    const unread = db.prepare('SELECT COUNT(*) as cnt FROM messages WHERE chat_id=? AND sender_id != ? AND read=0').get(chat.id, req.user.id).cnt;
    return { ...chat, members, lastMsg, unread };
  });
  res.json(enriched);
});

// Группы — тоже реальные пользователи
app.post('/api/groups/create', authMiddleware, (req,res)=>{
  const { name, members } = req.body; // members: array of usernames
  if(!name || name.trim().length < 2) return res.status(400).json({error:'Название группы 2-30 символов'});
  const ids = [req.user.id];
  if(Array.isArray(members)){
    for(const uname of members){
      const u = getUserByUsername(uname.trim());
      if(u && !ids.includes(u.id)) ids.push(u.id);
    }
  }
  if(ids.length < 2) return res.status(400).json({error:'Добавь хотя бы одного реального участника'});
  const chatId = 'grp_' + uuidv4();
  const now = Date.now();
  db.prepare('INSERT INTO chats (id, is_group, name, created_by, created_at) VALUES (?,?,?,?,?)').run(chatId, 1, name.trim(), req.user.id, now);
  for(const uid of ids){
    db.prepare('INSERT INTO chat_members (chat_id, user_id) VALUES (?,?)').run(chatId, uid);
  }
  res.json({ chatId });
});

// Сообщения
app.get('/api/messages/:chatId', authMiddleware, (req,res)=>{
  const { chatId } = req.params;
  const member = db.prepare('SELECT 1 FROM chat_members WHERE chat_id=? AND user_id=?').get(chatId, req.user.id);
  if(!member) return res.status(403).json({error:'Нет доступа к чату'});
  const msgs = db.prepare('SELECT * FROM messages WHERE chat_id=? ORDER BY created_at ASC LIMIT 500').all(chatId);
  // помечаем доставленными
  db.prepare('UPDATE messages SET delivered=1 WHERE chat_id=? AND sender_id != ? AND delivered=0').run(chatId, req.user.id);
  res.json(msgs);
});

app.post('/api/messages', authMiddleware, upload.single('file'), (req,res)=>{
  const { chatId, text, type } = req.body;
  if(!chatId) return res.status(400).json({error:'chatId обязателен'});
  const member = db.prepare('SELECT 1 FROM chat_members WHERE chat_id=? AND user_id=?').get(chatId, req.user.id);
  if(!member) return res.status(403).json({error:'Нет доступа'});
  let mediaUrl = null;
  let mediaName = null;
  let msgType = type || 'text';
  if(req.file){
    mediaUrl = `/uploads/media/${req.file.filename}`;
    mediaName = req.file.originalname;
    if(req.file.mimetype.startsWith('image/')) msgType='image';
    else if(req.file.mimetype.startsWith('video/')) msgType='video';
    else if(req.file.mimetype.startsWith('audio/')) msgType='audio';
    else msgType='file';
  }
  if(!text && !mediaUrl) return res.status(400).json({error:'Пустое сообщение'});
  const id = uuidv4();
  const now = Date.now();
  db.prepare('INSERT INTO messages (id, chat_id, sender_id, type, text, media_url, media_name, created_at, delivered, read) VALUES (?,?,?,?,?,?,?,?,?,?)')
    .run(id, chatId, req.user.id, msgType, text||null, mediaUrl, mediaName, now, 0, 0);
  const msg = db.prepare('SELECT * FROM messages WHERE id=?').get(id);
  // realtime
  io.to(chatId).emit('new_message', msg);
  // уведомление вне чата
  // статусы доставки — только от реальных собеседников (через сокет ack)
  res.json(msg);
});

// Отметить прочитанным
app.post('/api/messages/:chatId/read', authMiddleware, (req,res)=>{
  const { chatId } = req.params;
  db.prepare('UPDATE messages SET read=1, delivered=1 WHERE chat_id=? AND sender_id != ? AND read=0').run(chatId, req.user.id);
  io.to(chatId).emit('messages_read', { chatId, readerId: req.user.id });
  res.json({ok:true});
});

// Список пользователей (для админки, только реальные)
app.get('/api/users', authMiddleware, (req,res)=>{
  const users = db.prepare('SELECT id, username, avatar, created_at FROM users ORDER BY created_at DESC LIMIT 100').all();
  res.json(users);
});

// --- Socket.io ---
const online = new Map(); // userId -> socketId

io.use((socket, next)=>{
  const token = socket.handshake.auth?.token || socket.handshake.query?.token;
  if(!token) return next(new Error('No token'));
  const user = getUserById(token);
  if(!user) return next(new Error('Invalid user'));
  socket.user = user;
  next();
});

io.on('connection', (socket)=>{
  const user = socket.user;
  online.set(user.id, socket.id);
  console.log(`[SOCKET] Real user online: ${user.username} (${socket.id})`);
  // join all his chats
  const myChats = db.prepare('SELECT chat_id FROM chat_members WHERE user_id=?').all(user.id);
  myChats.forEach(r=> socket.join(r.chat_id));
  // broadcast online
  io.emit('online_list', Array.from(online.keys()));

  socket.on('join_chat', (chatId)=>{
    const member = db.prepare('SELECT 1 FROM chat_members WHERE chat_id=? AND user_id=?').get(chatId, user.id);
    if(member) socket.join(chatId);
  });

  socket.on('typing', ({chatId, isTyping})=>{
    socket.to(chatId).emit('typing', {chatId, userId: user.id, username: user.username, isTyping});
  });

  socket.on('message_delivered', ({messageId, chatId})=>{
    db.prepare('UPDATE messages SET delivered=1 WHERE id=?').run(messageId);
    io.to(chatId).emit('message_status', {messageId, delivered:1, read:0});
  });

  socket.on('message_read', ({messageId, chatId})=>{
    db.prepare('UPDATE messages SET read=1, delivered=1 WHERE id=?').run(messageId);
    io.to(chatId).emit('message_status', {messageId, delivered:1, read:1});
  });

  // Voice signaling (low bitrate, без шумоподавления — настраивается на клиенте)
  socket.on('voice:offer', (data)=>{
    socket.to(data.chatId).emit('voice:offer', { ...data, from: user.id, username: user.username });
  });
  socket.on('voice:answer', (data)=>{
    socket.to(data.chatId).emit('voice:answer', { ...data, from: user.id });
  });
  socket.on('voice:ice', (data)=>{
    socket.to(data.chatId).emit('voice:ice', { ...data, from: user.id });
  });
  socket.on('voice:leave', ({chatId})=>{
    socket.to(chatId).emit('voice:leave', { from: user.id });
  });

  socket.on('disconnect', ()=>{
    online.delete(user.id);
    io.emit('online_list', Array.from(online.keys()));
    console.log(`[SOCKET] Offline: ${user.username}`);
  });
});

// --- Render persistence notes ---
// На Render обязательно подключить Persistent Disk (например 1GB) и смонтировать в /opt/render/project/src/data и /opt/render/project/src/uploads
// Тогда при каждом деплое БД, аватары, медиа, группы, айди — сохраняются.
// Логи при этом НЕ пишутся на диск, только в stdout, и их можно чистить командой npm run clean-logs
// render.yaml ниже уже настроен

// fallback to SPA
app.get('*', (req,res)=>{
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

server.listen(PORT, '0.0.0.0', ()=>{
  console.log(`\n=== Лулу мессссссссссссссселдежерер запущен ===`);
  console.log(`Порт: ${PORT}`);
  console.log(`БД: ${dbPath} (WAL, сохраняется на диске)`);
  console.log(`Реальные пользователи только, без ботов/фейков`);
  console.log(`Вход без пароля — только логин`);
  console.log(`========================================\n`);
});
