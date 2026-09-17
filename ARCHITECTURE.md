# Архитектура «Лулу мессссссссссссссселдежерер»

## 1. Концепция и жесткие требования

| Требование | Реализация |
|------------|------------|
| **Только реальные пользователи** — никаких ботов, фейков, рекомендаций, заглушек | БД `users` только ручное создание через `/api/auth/login`. Нет seed-данных. Поиск `/api/users/search` — только точное совпадение / LIKE среди реальных. Таблица `contacts` — только ручное добавление. Socket `online_list` — только реальные сокеты. |
| **Аватарка обязательна и простая** | `POST /api/avatar` (multer) → `uploads/avatars/<uuid>.jpg`. Фронт: `<label>СМЕНИТЬ АВУ <input type=file>` — 1 клик. |
| **Текст + фото + видео realtime** | `POST /api/messages` multipart + `socket.io` `new_message`. Хранение в `uploads/media/`. Рендер фото/видео в чате. |
| **Статусы доставки/прочтения только от реальных** | `delivered/read` в `messages` + сокет `message_delivered`/`message_read` — триггерит только клиент собеседника. Нет фейковых галочек. |
| **Вход без пароля, только логин** | `POST /api/auth/login {username}` — если нет → `INSERT`, если есть → вернуть `token=user.id`. Нет email/password. |
| **Голосовой чат low-fi без шумодава** | WebRTC `getUserMedia({autoGainControl:false, noiseSuppression:false, echoCancellation:false, sampleRate:8000})` + SDP `maxaveragebitrate=8000`. Сигналинг через сокет `voice:offer/answer/ice`. |
| **Render: логи чистятся, данные сохраняются** | БД и файлы на Persistent Disk (`/data`, `/uploads`). Логи только stdout → Render ротирует. `npm run clean-logs` чистит только `logs/`. |

---

## 2. Стек

- **Backend:** Node 20, Express 4, Socket.io 4, better-sqlite3 9 (WAL), multer, uuid, cors
- **Frontend:** Vanilla JS, Socket.io-client, HTML5, CSS3 (Windows 98), WebRTC, Canvas (игры)
- **Хранение:** SQLite `data/lulu.db` + файлы `uploads/` + `public/music/*.mp3`
- **Деплой:** Render Web Service + 2 Persistent Disks

---

## 3. Схема БД (SQLite WAL)

```sql
users(id TEXT PK, username TEXT UNIQUE, avatar TEXT, created_at INTEGER)
contacts(user_id, contact_id, created_at) PK(user_id,contact_id)
chats(id TEXT PK, is_group BOOLEAN, name TEXT, created_by TEXT, created_at INTEGER)
chat_members(chat_id, user_id) PK(chat_id,user_id)
messages(id TEXT PK, chat_id TEXT FK, sender_id TEXT FK, type TEXT, text TEXT, media_url TEXT, media_name TEXT, created_at INTEGER, delivered BOOLEAN, read BOOLEAN)
```

- `pm_<sortedIds>` — личный чат (детерминированный)
- `grp_<uuid>` — группа

---

## 4. API

```
POST /api/auth/login {username} -> {user, token, isNew}
GET  /api/me [x-token] -> user
POST /api/avatar [x-token] multipart avatar -> user
GET  /api/users/search?q= [x-token] -> [user]
POST /api/contacts/add {username} -> {contact, chatId}
GET  /api/contacts -> [user]
GET  /api/chats -> [{id, is_group, name, members[], lastMsg, unread}]
POST /api/groups/create {name, members:[username]} -> {chatId}
GET  /api/messages/:chatId -> [message]
POST /api/messages multipart (chatId, text, file) -> message
POST /api/messages/:chatId/read -> {ok}
GET  /health -> {status}
```

Статика: `/`, `/uploads/*`, `/music/*`, `/socket.io/*`

---

## 5. Realtime (Socket.io)

```
auth: token=user.id
online: Map<userId, socketId> -> broadcast online_list
room: каждого чата -> socket.join(chatId)
events:
  client->server: join_chat, typing, message_delivered, message_read, voice:offer/answer/ice/leave
  server->client: new_message, typing, message_status, messages_read, online_list, user_updated, voice:*
```

Доставка: после `GET /api/messages` → `UPDATE delivered=1`; при просмотре → сокет `message_read` → `UPDATE read=1`.

---

## 6. Голосовой чат (low-fi)

```js
getUserMedia({
  audio: {
    channelCount: 1,
    sampleRate: 8000,
    sampleSize: 8,
    autoGainControl: false,
    noiseSuppression: false,
    echoCancellation: false
  }
})
pc = new RTCPeerConnection({iceServers:[{urls:'stun:stun.l.google.com:19302'}]})
offer.sdp = offer.sdp.replace(/a=fmtp:111.*\r\n/, 'a=fmtp:111 minptime=10;useinbandfec=0; maxaveragebitrate=8000\r\n')
```

Результат: хриплый, узкополосный звук как по диал-апу 2003 — по ТЗ.

---

## 7. Фронтенд — 90s стиль

- Фон `#008080` + тайл `💾`, окна `c0c0c0` с `inset/outset`, title-bar `000080→0000cd`
- Шрифты `VT323` + `Press Start 2P`, CRT сканлайны `#crt`
- Layout: `grid 280px | 1fr | 300px` → адаптив `1fr` на мобиле
- Компоненты: контакты (вручную), чат (фото/видео + ✓✓), WinAmp-плеер, таб-игры, сетка режимов

### Режимы (body class)

| Класс | Эффект |
|-------|--------|
| `evil` | `background:#0a0000`, красный градиент, `hue-rotate`, overlay radial red |
| `undertale` | `background:#000`, белый бордер, `Press Start 2P 8px`, `* Ты чувствуешь решимость...` |
| `nightvision` | `sepia hue-rotate 70deg saturate 3`, зеленый сканлайн, `◉ NVG ON` |
| `nyanket` | `background:#ffccff + 🐱 тайл`, розовые окна, `мяу` |
| `psychedelic` | `animation hue 3s`, `radial gradient` overlay, `wobble 0.5s` |
| `memes` | `Impact uppercase`, желтый `dashed`, `🗿 СТОП МЕМЫ` |
| `default` | 90s |

Хранятся в `localStorage.lulu_mode`.

---

## 8. Мини-игры

**Сапер** 9×9 10 мин: `grid[][]`, `reveal/flood`, ПКМ флаг, `gameOver`, `checkWin`.

**Яйца**: `canvas 260×180`, `basketX` (keys ← → / mouse/touch), `eggs[] {x,y,vy}`, `spawn 4%`, `requestAnimationFrame`, `score` (+1 поймал, -1 упал).

---

## 9. Музыка

Исходные 4 `.png` (на деле `audio/mpeg 64kbps 48kHz`) скопированы в `public/music/track*.mp3` и отдаются через `/music`. Плеер: `audio` + `playlist` + `display`. После деплоя файлы на диске → не пропадают.

---

## 10. Render — сохранение данных

```
Build: npm install
Start: npm start
PORT: 10000 (или $PORT)

Disk 1: lulu-data     -> /opt/render/project/src/data    (1 GB)
Disk 2: lulu-uploads  -> /opt/render/project/src/uploads (1 GB)
```

- Без диска: при каждом `git push` Render клонирует репо заново → `data/` и `uploads/` стираются.
- С диском: монтируется поверх — SQLite, аватары, медиа, группы, ID **сохраняются даже после обновления**.
- Логи: пишутся только в `console.log` → stdout Render (ротация 7 дней). Не пишутся в `data/`. Очистка: `npm run clean-logs` (`rm -f logs/*.log`).

`render.yaml` уже содержит инструкцию.

---

## 11. Безопасность и изоляция

- Нет ботов: нет сидов, нет cron-генерации, нет `faker`.
- Нет рекомендаций: `contacts` только ручные, `/search` не отдает топ.
- Нет заглушек: все сообщения в `messages`, нет `mockServer`.
- Валидация логина: `2-20`, `^[\w\u0400-\u04FF-]+$`.
- Токен упрощен (по ТЗ без пароля) — в проде заменить на `JWT + httpOnly cookie`.
- Для продакшена добавить: `helmet`, `rateLimit`, `sanitize`, `CORS origin`.

---

## 12. Как запустить

```bash
git clone <repo> && cd lulu-messenger
npm install
npm start # http://localhost:3000
```

Тест: открой 2 браузера, войди как `lulu` и `testuser`, добавь друг друга, кидай фото/видео, звони.

---

## 13. Что дальше (опционально)

- E2E шифрование (Signal Protocol)
- Аудио-сообщения (MediaRecorder)
- Поиск по сообщениям, эмодзи
- PWA + пуши
- Админка с банами

---

*Сделано для Лулу — 1998 зовет, но работает в 2026.*
