/**
 * Лулу мессссссссссссссселдежерер — защищенный мессенджер
 * Стиль: старый интернет 90-х - середины 2000-х
 * FIX для Render: убран better-sqlite3 (native), теперь JSON-хранилище (pure JS)
 * - Работает на free плане без компиляции
 * - Данные всё равно сохраняются: если подключить Persistent Disk → data/db.json сохраняется
 * - Логи чистятся отдельно (stdout, не пишутся на диск)
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
const DB_FILE = path.join(DATA_DIR, 'db.json');

// ensure dirs
[DATA_DIR, AVATAR_DIR, MEDIA_DIR].forEach(d => { if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true }); });

// --- JSON DB (pure JS, no native) ---
let db = { users: [], contacts: [], chats: [], chat_members: [], messages: [] };
function loadDB(){
  try{
    if(fs.existsSync(DB_FILE)){
      const raw = fs.readFileSync(DB_FILE, 'utf8');
      const parsed = JSON.parse(raw);
      // merge defaults
      db = Object.assign({ users: [], contacts: [], chats: [], chat_members: [], messages: [] }, parsed);
      console.log(`[DB] Загружено из ${DB_FILE}: ${db.users.length} юзеров, ${db.messages.length} сообщений`);
    } else {
      console.log(`[DB] Новый файл ${DB_FILE} будет создан`);
      saveDB();
    }
    // migrate from old SQLite if exists and db empty
    const oldSqlite = path.join(DATA_DIR, 'lulu.db');
    if(fs.existsSync(oldSqlite) && db.users.length===0){
      console.log(`[DB] Обнаружен старый lulu.db — миграция не требуется, начинаем с чистого JSON`);
    }
  }catch(e){
    console.error('[DB] Ошибка загрузки, создаем заново', e);
    db = { users: [], contacts: [], chats: [], chat_members: [], messages: [] };
  }
}
function saveDB(){
  try{
    fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2));
  }catch(e){ console.error('[DB] Ошибка сохранения', e); }
}
loadDB();

// helpers — как в SQLite версии, но на массивах
function getUserById(id){ return db.users.find(u=>u.id===id) || null; }
function getUserByUsername(username){ return db.users.find(u=>u.username===username) || null; }
// case-insensitive поиск (чтобы «Найден: Lulu» добавлялся даже если ввели «lulu»)
function getUserByUsernameCI(username){
  if(!username) return null;
  const low = username.toLowerCase();
  return db.users.find(u=>u.username && u.username.toLowerCase()===low) || null;
}
function addUser(u){ db.users.push(u); saveDB(); }
function updateUserAvatar(id, avatar){ const u=getUserById(id); if(u){ u.avatar=avatar; saveDB(); } return u; }

function getContacts(userId){
  const contactIds = db.contacts.filter(c=>c.user_id===userId).map(c=>c.contact_id);
  return db.users.filter(u=> contactIds.includes(u.id));
}
function addContact(userId, contactId){
  if(db.contacts.some(c=>c.user_id===userId && c.contact_id===contactId)) return false;
  db.contacts.push({ user_id: userId, contact_id: contactId, created_at: Date.now() });
  saveDB(); return true;
}

function getChatsForUser(userId){
  const chatIds = db.chat_members.filter(m=>m.user_id===userId).map(m=>m.chat_id);
  return db.chats.filter(c=> chatIds.includes(c.id));
}
function getChatById(id){ return db.chats.find(c=>c.id===id) || null; }
function getChatMembers(chatId){
  const ids = db.chat_members.filter(m=>m.chat_id===chatId).map(m=>m.user_id);
  return db.users.filter(u=> ids.includes(u.id));
}
function isMember(chatId, userId){ return db.chat_members.some(m=>m.chat_id===chatId && m.user_id===userId); }
function createChat({id, is_group, name, created_by}){
  const chat = { id, is_group: is_group?1:0, name: name||null, created_by, created_at: Date.now() };
  db.chats.push(chat); saveDB(); return chat;
}
function addMember(chatId, userId){
  if(!isMember(chatId, userId)){
    db.chat_members.push({ chat_id: chatId, user_id: userId });
    saveDB();
  }
}

function getMessages(chatId){
  return db.messages.filter(m=>m.chat_id===chatId).sort((a,b)=>a.created_at-b.created_at).slice(-500);
}
function getLastMessage(chatId){
  const msgs = db.messages.filter(m=>m.chat_id===chatId).sort((a,b)=>b.created_at-a.created_at);
  return msgs[0]||null;
}
function getUnreadCount(chatId, userId){
  return db.messages.filter(m=>m.chat_id===chatId && m.sender_id!==userId && !m.read).length;
}
function addMessage(msg){
  db.messages.push(msg); saveDB(); return msg;
}
function markDelivered(chatId, userId){
  let changed=false;
  db.messages.forEach(m=>{
    if(m.chat_id===chatId && m.sender_id!==userId && !m.delivered){ m.delivered=1; changed=true; }
  });
  if(changed) saveDB();
}
function markRead(chatId, userId){
  let changed=false;
  db.messages.forEach(m=>{
    if(m.chat_id===chatId && m.sender_id!==userId && !m.read){ m.read=1; m.delivered=1; changed=true; }
  });
  if(changed) saveDB();
}
function markMessageDelivered(id){
  const m=db.messages.find(x=>x.id===id); if(m && !m.delivered){ m.delivered=1; saveDB(); }
}
function markMessageRead(id){
  const m=db.messages.find(x=>x.id===id); if(m){ m.read=1; m.delivered=1; saveDB(); }
}

function getOrCreatePrivateChat(a,b){
  const sorted = [a,b].sort().join('_');
  const chatId = `pm_${sorted}`;
  let chat = getChatById(chatId);
  if(!chat){
    chat = createChat({id: chatId, is_group:0, name:null, created_by:a});
    addMember(chatId, a);
    addMember(chatId, b);
  }
  return chatId;
}

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

// auth
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
  fileFilter: (req,file,cb)=> cb(null,true)
});

// --- API ---
app.get('/health', (req,res)=>res.json({status:'ok', time: Date.now(), users: db.users.length, messages: db.messages.length}));

app.post('/api/auth/login', (req,res)=>{
  let { username } = req.body;
  if(!username) return res.status(400).json({error:'Логин обязателен'});
  username = username.trim();
  if(username.length < 2 || username.length > 20) return res.status(400).json({error:'Логин должен быть 2-20 символов'});
  if(!/^[\w\u0400-\u04FF-]+$/.test(username)) return res.status(400).json({error:'Только буквы, цифры, _ и -'});
  let user = getUserByUsername(username);
  let isNew = false;
  if(!user){
    const id = uuidv4();
    const now = Date.now();
    user = { id, username, avatar: null, created_at: now };
    addUser(user);
    isNew = true;
    console.log(`[AUTH] Новый реальный пользователь: ${username} (${id})`);
  } else {
    console.log(`[AUTH] Вход реального пользователя: ${username}`);
  }
  res.json({ user, token: user.id, isNew });
});

app.get('/api/me', authMiddleware, (req,res)=> res.json(req.user));

app.post('/api/avatar', authMiddleware, upload.single('avatar'), (req,res)=>{
  if(!req.file) return res.status(400).json({error:'Файл не загружен'});
  const rel = `/uploads/avatars/${req.file.filename}`;
  const updated = updateUserAvatar(req.user.id, rel);
  io.emit('user_updated', updated);
  res.json(updated);
});

app.get('/api/users/search', authMiddleware, (req,res)=>{
  const q = (req.query.q || '').trim();
  if(!q) return res.json([]);
  const user = getUserByUsername(q);
  if(user && user.id !== req.user.id){
    res.json([user]);
  } else {
    const like = db.users.filter(u=> u.username.toLowerCase().includes(q.toLowerCase()) && u.id !== req.user.id).slice(0,10);
    res.json(like);
  }
});

app.get('/api/contacts', authMiddleware, (req,res)=>{
  res.json(getContacts(req.user.id));
});

app.post('/api/contacts/add', authMiddleware, (req,res)=>{
  const { username } = req.body;
  if(!username) return res.status(400).json({error:'Укажи логин'});
  const clean = username.trim();
  // точное совпадение + fallback без учёта регистра (фикс «найден, но не добавляется»)
  const target = getUserByUsername(clean) || getUserByUsernameCI(clean);
  if(!target) return res.status(404).json({error:'Пользователь не найден. Только реальные люди!'});
  if(target.id === req.user.id) return res.status(400).json({error:'Нельзя добавить себя'});
  if(db.contacts.some(c=>c.user_id===req.user.id && c.contact_id===target.id)) return res.status(400).json({error:'Уже в контактах'});
  addContact(req.user.id, target.id);
  const chatId = getOrCreatePrivateChat(req.user.id, target.id);
  res.json({ contact: target, chatId });
});

app.get('/api/chats', authMiddleware, (req,res)=>{
  const chats = getChatsForUser(req.user.id).sort((a,b)=>b.created_at-a.created_at);
  const enriched = chats.map(chat=>{
    const members = getChatMembers(chat.id);
    const lastMsg = getLastMessage(chat.id);
    const unread = getUnreadCount(chat.id, req.user.id);
    return { ...chat, members, lastMsg, unread };
  });
  res.json(enriched);
});

app.post('/api/groups/create', authMiddleware, (req,res)=>{
  const { name, members } = req.body;
  if(!name || name.trim().length < 2) return res.status(400).json({error:'Название группы 2-30 символов'});
  const ids = [req.user.id];
  if(Array.isArray(members)){
    for(const uname of members){
      const clean = (uname||'').trim();
      const u = getUserByUsername(clean) || getUserByUsernameCI(clean);
      if(u && !ids.includes(u.id)) ids.push(u.id);
    }
  }
  if(ids.length < 2) return res.status(400).json({error:'Добавь хотя бы одного реального участника'});
  const chatId = 'grp_' + uuidv4();
  createChat({id: chatId, is_group:1, name: name.trim(), created_by: req.user.id});
  for(const uid of ids) addMember(chatId, uid);
  res.json({ chatId });
});

app.get('/api/messages/:chatId', authMiddleware, (req,res)=>{
  const { chatId } = req.params;
  if(!isMember(chatId, req.user.id)) return res.status(403).json({error:'Нет доступа к чату'});
  const msgs = getMessages(chatId);
  markDelivered(chatId, req.user.id);
  res.json(msgs);
});

app.post('/api/messages', authMiddleware, upload.single('file'), (req,res)=>{
  const { chatId, text, type } = req.body;
  if(!chatId) return res.status(400).json({error:'chatId обязателен'});
  if(!isMember(chatId, req.user.id)) return res.status(403).json({error:'Нет доступа'});
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
  const msg = {
    id: uuidv4(),
    chat_id: chatId,
    sender_id: req.user.id,
    type: msgType,
    text: text||null,
    media_url: mediaUrl,
    media_name: mediaName,
    created_at: Date.now(),
    delivered: 0,
    read: 0
  };
  addMessage(msg);
  io.to(chatId).emit('new_message', msg);
  res.json(msg);
});

app.post('/api/messages/:chatId/read', authMiddleware, (req,res)=>{
  const { chatId } = req.params;
  markRead(chatId, req.user.id);
  io.to(chatId).emit('messages_read', { chatId, readerId: req.user.id });
  res.json({ok:true});
});

app.get('/api/users', authMiddleware, (req,res)=>{
  res.json(db.users.slice(0,100).map(u=>({id:u.id, username:u.username, avatar:u.avatar, created_at:u.created_at})));
});

// --- Socket.io ---
const online = new Map();
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
  const myChats = db.chat_members.filter(m=>m.user_id===user.id).map(m=>m.chat_id);
  myChats.forEach(c=> socket.join(c));
  io.emit('online_list', Array.from(online.keys()));
  socket.on('join_chat', (chatId)=>{
    if(isMember(chatId, user.id)) socket.join(chatId);
  });
  socket.on('typing', ({chatId, isTyping})=>{
    socket.to(chatId).emit('typing', {chatId, userId: user.id, username: user.username, isTyping});
  });
  socket.on('message_delivered', ({messageId, chatId})=>{
    markMessageDelivered(messageId);
    io.to(chatId).emit('message_status', {messageId, delivered:1, read:0});
  });
  socket.on('message_read', ({messageId, chatId})=>{
    markMessageRead(messageId);
    io.to(chatId).emit('message_status', {messageId, delivered:1, read:1});
  });
  socket.on('voice:offer', (data)=>{ socket.to(data.chatId).emit('voice:offer', { ...data, from: user.id, username: user.username }); });
  socket.on('voice:answer', (data)=>{ socket.to(data.chatId).emit('voice:answer', { ...data, from: user.id }); });
  socket.on('voice:ice', (data)=>{ socket.to(data.chatId).emit('voice:ice', { ...data, from: user.id }); });
  socket.on('voice:leave', ({chatId})=>{ socket.to(chatId).emit('voice:leave', { from: user.id }); });
  socket.on('disconnect', ()=>{
    online.delete(user.id);
    io.emit('online_list', Array.from(online.keys()));
    console.log(`[SOCKET] Offline: ${user.username}`);
  });
});

// fallback SPA
app.get('*', (req,res)=> res.sendFile(path.join(__dirname, 'public', 'index.html')));

server.listen(PORT, '0.0.0.0', ()=>{
  console.log(`\n=== Лулу мессссссссссссссселдежерер запущен (JSON DB) ===`);
  console.log(`Порт: ${PORT}`);
  console.log(`БД: ${DB_FILE} (JSON, сохраняется на диске если подключить Persistent Disk)`);
  console.log(`Загружено: ${db.users.length} юзеров, ${db.chats.length} чатов, ${db.messages.length} сообщений`);
  console.log(`Реальные пользователи только, без ботов/фейков`);
  console.log(`Вход без пароля — только логин`);
  console.log(`========================================\n`);
});

// Graceful save on exit
process.on('SIGTERM', ()=>{ saveDB(); process.exit(0); });
process.on('SIGINT', ()=>{ saveDB(); process.exit(0); });
