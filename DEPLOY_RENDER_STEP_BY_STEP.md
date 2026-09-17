# Деплой «Лулу мессссссссссссссселдежерер» на Render — пошагово

## Цель
Чтобы после каждого `git push` / рестарта **не пропадали**: БД, аватары, фото/видео, контакты, группы, ID. А **логи чистились**.

---

## Шаг 1 — Подготовь репо

```bash
cd lulu-messenger
git init
git add .
git commit -m "lulu messenger 90s edition"
# создай репо на GitHub и:
git remote add origin https://github.com/<твой-логин>/lulu-messenger.git
git push -u origin main
```

Убедись что в репо есть:
- `package.json` (start: node server.js)
- `render.yaml` (инструкция)
- `public/music/track*.mp3` (4 трека уже сконвертированы из .png)

---

## Шаг 2 — Создай Web Service на Render

1. https://dashboard.render.com → **New +** → **Web Service**
2. Подключи GitHub репо `lulu-messenger`
3. Настройки:
   - **Name:** `lulu-messenger`
   - **Runtime:** `Node`
   - **Build Command:** `npm install`
   - **Start Command:** `npm start`
   - **Node Version:** `20`
   - **Plan:** Free (для теста) или Starter (для дисков)

4. Нажми **Create Web Service** — первый деплой пройдет, но **без диска данные будут стираться**.

---

## Шаг 3 — Подключи Persistent Disk (САМОЕ ВАЖНОЕ)

> На Free-плане диски могут быть недоступны — нужен **Starter** ($7/мес) или выше. Если Free — данные будут теряться, это ограничение Render.

### Вариант А — 2 диска (рекомендуется)

В сервисе → **Environment** → **Add Disk**:

| Name | Mount Path | Size |
|------|------------|------|
| `lulu-data` | `/opt/render/project/src/data` | 1 GB |
| `lulu-uploads` | `/opt/render/project/src/uploads` | 1 GB |

### Вариант B — 1 диск на весь проект

| Name | Mount Path | Size |
|------|------------|------|
| `lulu-all` | `/opt/render/project/src` | 2 GB |

После добавления диска Render **перезапустит сервис** и смонтирует папки. Теперь:

- `data/lulu.db` (WAL) — сохраняется
- `data/lulu.db-shm` / `lulu.db-wal` — тоже
- `uploads/avatars/*` — аватары сохраняются
- `uploads/media/*` — фото/видео из чатов сохраняются
- `chats`, `contacts`, `groups`, `IDs` — всё в БД, значит тоже сохраняется

---

## Шаг 4 — Проверь

1. Открой `https://<твой-сервис>.onrender.com`
2. Зарегистрируй `lulu`, загрузи аву, создай контакт `test`, отправь фото
3. Сделай `git push` (измени README)
4. Дождись редеплоя → открой сайт снова → **данные на месте**.

Логи смотри в **Logs** — они ротируются сами. Локально чистить:

```bash
npm run clean-logs
# удаляет только logs/*.log, не трогает data/ и uploads/
```

---

## Шаг 5 — Переменные окружения (опционально)

В **Environment** → **Add Environment Variable**:

- `NODE_VERSION=20.20.2`
- `PORT=10000` (Render ставит сам)

---

## Частые вопросы

**Q: Почему после обновления пропали аватары?**
A: Забыл подключить Disk. Без диска Render каждый раз клонирует репо с нуля.

**Q: Можно ли хранить музыку на диске?**
A: Да, `public/music` сейчас в репо (4 трека). Если хочешь загружать новые — клади в `uploads/media` (он на диске).

**Q: Как подчистить логи, но не удалить чаты?**
A: Логи — это stdout, они не на диске. `npm run clean-logs` чистит только `logs/`. БД не трогает.

**Q: Бесплатный тариф без диска — что делать?**
A: Используй внешний S3 (Cloudinary, S3) для файлов и внешний Postgres/Neon для БД. Но по ТЗ проще взять Starter + Disk.

---

## Готово!

Твой олдскульный мессенджер теперь живет на Render как в 1999, но с сохранением данных в 2026.
