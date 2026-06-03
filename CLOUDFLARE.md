# FreeChat на Cloudflare Workers

Проект переписан под Cloudflare Workers без FastAPI. Что используется:

- Worker: HTTP-страницы, auth, API.
- D1: пользователи, чаты, сообщения, профили.
- Durable Object: realtime WebSocket-комната.
- Wrangler: локальный запуск, миграции, деплой.

## Локальный запуск

```bash
cd FreeChat
npm install
npm run db:local
npm run dev
```

После запуска Wrangler даст локальный URL, обычно `http://localhost:8787`.

Тестовые аккаунты:

```text
admin / 123456
alice / alice123
bob / bob123
```

## Создать D1 в Cloudflare

```bash
npx wrangler login
npx wrangler d1 create freechat-db
```

Wrangler выведет `database_id`. Его надо вставить в `wrangler.toml` вместо:

```toml
database_id = "replace-with-cloudflare-d1-database-id"
```

## Применить миграции в Cloudflare

```bash
npm run db:remote
```

## Деплой

```bash
npm run deploy
```

После деплоя приложение будет доступно на `*.workers.dev`, если в аккаунте включен workers.dev.

## Что пока MVP

- Аватары хранятся прямо в D1 как data URL, поэтому лимит поставлен 512KB.
- Сессия простая: cookie с username. Для продакшена лучше добавить signed session token.
- Все пользователи сидят в одном Durable Object `global`. Для большого чата потом можно разбить по комнатам.
