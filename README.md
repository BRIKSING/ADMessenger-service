# ADMessenger — Backend

Node.js + TypeScript сервер семейного мессенджера. REST API + Socket.IO на одном HTTP-сервере.

**Стек:** Express · Socket.IO · Prisma · PostgreSQL · Redis · Docker Compose · APNs

---

## Деплой на VPS

### Требования к серверу

- VPS: 2 vCPU, 2 ГБ RAM (достаточно для семейного масштаба ~20 пользователей)
- OS: Ubuntu 22.04 / Debian 12
- Установлены: Docker 24+, Docker Compose v2, Git
- Открытые порты: `3000` (API), `3478` UDP+TCP (TURN/STUN), `3478` UDP (TURN relay range)

### Шаг 1 — Клонировать репозиторий

```bash
git clone <repo-url> /opt/admessenger
cd /opt/admessenger
```

### Шаг 2 — Заполнить переменные окружения

```bash
cp .env.example .env
nano .env
```

Таблица всех переменных:

| Переменная | Обязательна | Описание |
|---|---|---|
| `NODE_ENV` | да | `production` на боевом сервере |
| `PORT` | да | Порт HTTP-сервера (по умолчанию 3000) |
| `DATABASE_URL` | да | Строка подключения к PostgreSQL |
| `REDIS_URL` | да | Строка подключения к Redis |
| `JWT_SECRET` | да | Случайная строка ≥32 символов, держать в секрете |
| `JWT_ACCESS_TTL` | да | Время жизни access token (напр. `15m`) |
| `JWT_REFRESH_TTL` | да | Время жизни refresh token (напр. `30d`) |
| `POSTGRES_USER` | да | Логин PostgreSQL (для docker-compose) |
| `POSTGRES_PASSWORD` | да | Пароль PostgreSQL (для docker-compose) |
| `POSTGRES_DB` | да | Имя базы данных (для docker-compose) |
| `TURN_SERVER` | да | Адрес Coturn, напр. `turn.example.com:3478` |
| `TURN_SECRET` | да | Общий секрет с Coturn (любая случайная строка) |
| `APNS_KEY_PATH` | для iOS push | Путь к `.p8` ключу APNs |
| `APNS_KEY_ID` | для iOS push | ID ключа из Apple Developer Portal |
| `APNS_TEAM_ID` | для iOS push | Team ID из Apple Developer Portal |
| `APNS_BUNDLE_ID` | для iOS push | Bundle ID приложения, напр. `com.example.messenger` |
| `S3_ENDPOINT` | для медиа | URL MinIO/S3, напр. `http://minio:9000` |
| `S3_BUCKET` | для медиа | Имя бакета |
| `S3_ACCESS_KEY` | для медиа | Access key S3 |
| `S3_SECRET_KEY` | для медиа | Secret key S3 |
| `MINIO_ROOT_USER` | для медиа | Логин MinIO (для docker-compose) |
| `MINIO_ROOT_PASSWORD` | для медиа | Пароль MinIO (для docker-compose) |
| `TWILIO_ACCOUNT_SID` | для OTP SMS | Аккаунт Twilio (нужен после реализации OTP) |
| `TWILIO_AUTH_TOKEN` | для OTP SMS | Auth token Twilio |
| `TWILIO_FROM` | для OTP SMS | Номер отправителя SMS |

### Шаг 3 — Положить APNs ключ

Скачать `.p8` файл в Apple Developer Portal → Certificates, Identifiers & Profiles → Keys.

```bash
mkdir -p /opt/admessenger/certs
cp ~/Downloads/AuthKey_XXXXXXXXXX.p8 /opt/admessenger/certs/apns.p8
```

В `.env` указать:
```
APNS_KEY_PATH=./certs/apns.p8
```

### Шаг 4 — Настроить Coturn

Добавить в конфиг Coturn (`/etc/turnserver.conf` или через docker env):

```
use-auth-secret
static-auth-secret=<то же значение, что TURN_SECRET в .env>
realm=turn.example.com
```

Coturn уже включён в `docker-compose.yml` и запускается автоматически.

### Шаг 5 — Запустить все сервисы

```bash
docker compose up -d
```

Запустится: `app`, `postgres`, `redis`, `minio`, `coturn`.

### Шаг 6 — Применить миграции БД

```bash
docker compose exec app npx prisma migrate deploy
```

### Шаг 7 — Проверить работу

```bash
curl http://localhost:3000/health
# → {"ok":true}
```

### Обновление сервера

```bash
git pull
docker compose build app
docker compose up -d app
docker compose exec app npx prisma migrate deploy
```

---

## Локальная разработка

```bash
cp .env.example .env       # заполнить DATABASE_URL, REDIS_URL, JWT_SECRET
docker compose up -d postgres redis
npm install
npm run prisma:migrate
npm run dev
```

## Команды

```bash
npm run dev              # запуск в watch-режиме
npm run build            # компиляция TypeScript → dist/
npm start                # запуск скомпилированной версии
npm run prisma:migrate   # создать и применить новую миграцию (dev)
npm run prisma:generate  # перегенерировать Prisma Client после правок схемы
```

---

## Статус реализации

### ✅ Готово

#### Авторизация
- `POST /auth/login` — вход по номеру телефона (без OTP, для тестирования)
- `GET /auth/me` — профиль текущего пользователя
- JWT access token (TTL 15 мин), проверка на REST и Socket.IO handshake

#### Пользователи
- `POST /users/contacts/sync` — синхронизация телефонной книги через SHA-256 хэши
- `GET /users/contacts` — список контактов
- `GET /users/search?q=` — поиск по имени и никнейму
- `POST /users/:id/block` / `DELETE /users/:id/block` — блокировка / разблокировка
- `GET /users/blocked` — список заблокированных
- `PATCH /users/me` — обновление профиля (имя, никнейм, bio)
- `POST /users/me/device-token` — регистрация APNs / VoIP / FCM токена
- `DELETE /users/me/device-token` — удаление токена при логауте

#### Чаты и сообщения
- `GET /chats` — список чатов с последним сообщением и счётчиком непрочитанных
- `POST /chats` — создать личный (DIRECT) или групповой (GROUP) чат
- `GET /chats/:id/messages` — история сообщений (cursor-based, до 100 за запрос)
- `PATCH /chats/:id/messages/:msgId` — редактирование своего сообщения
- `DELETE /chats/:id/messages/:msgId` — удаление (для себя или для всех, лимит 48 ч)
- Socket `message:send` → `message:new` + `message:ack`
- Socket `message:read` — массовое прочтение до указанного сообщения
- Socket `typing:start` / `typing:stop`

#### Присутствие
- Socket `presence:snapshot` — список онлайн-пользователей при подключении
- Socket `presence:update` — рассылка при входе и выходе пользователя
- `lastSeen` обновляется в БД при отключении
- Redis `presence:{userId}` с TTL — страховка при падении сервера
- Поддержка нескольких устройств одного пользователя

#### Звонки
- Socket `call:offer` / `call:answer` / `call:ice-candidate` / `call:hangup` / `call:decline`
- `GET /calls/history` — история звонков с пагинацией (cursor-based)
- `GET /calls/turn-credentials` — временные HMAC-credentials для Coturn (TTL 1 ч, RFC 5766)
- Запись в `CallLog` со статусами ACCEPTED / DECLINED / MISSED

#### Push-уведомления
- APNs alert — уведомление о новом сообщении офлайн-пользователю
- APNs VoIP (PushKit) — пробуждение приложения при входящем звонке
- Автоматическая очистка невалидных токенов (BadDeviceToken / Unregistered)
- FCM — заглушка, готова к реализации при добавлении Android

---

### 🔲 Не реализовано

#### Авторизация
- `POST /auth/send-otp` — отправка SMS-кода (Twilio / SMS Aero)
- `POST /auth/verify-otp` — проверка кода, выдача токенов
- `POST /auth/refresh` — обновление access token через refresh token
- Хранение OTP в Redis с TTL 5 мин
- Rate limiting: макс. 5 попыток OTP за 10 мин, макс. 3 SMS в час

#### Медиа
- `POST /media/upload` — загрузка файлов в S3/MinIO
- Аватар пользователя с ресайзом до 64 / 128 / 512 px (sharp)
- Presigned URL для доступа к медиафайлам (TTL 1 ч)
- Изображения в чате (JPEG / PNG / WebP / GIF, до 20 МБ)
- Голосовые сообщения (AAC / OPUS, до 5 мин)

#### Чаты
- Системные сообщения (создание группы, добавление / удаление участника)
- Redis-кэш последних 50 сообщений чата (снизить нагрузку на PostgreSQL)
