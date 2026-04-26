# ADMessenger — Backend

Node.js + TypeScript сервер семейного мессенджера. REST API + Socket.IO на одном HTTP-сервере.

**Стек:** Express · Socket.IO · Prisma · PostgreSQL · Redis · Docker Compose · APNs

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

---

## Быстрый старт

```bash
cp .env.example .env        # заполнить переменные
docker-compose up -d        # postgres, redis, minio, coturn
npm install
npm run prisma:migrate
npm run dev
```

## Команды

```bash
npm run dev              # запуск в watch-режиме
npm run build            # компиляция TypeScript → dist/
npm start                # запуск скомпилированной версии
npm run prisma:migrate   # применить миграции БД
npm run prisma:generate  # перегенерировать Prisma Client
```
