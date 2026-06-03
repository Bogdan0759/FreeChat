# FreeChat на Cloudflare Workers

Что используется:

- Worker: HTTP-страницы, auth, API.
- D1: пользователи, чаты, сообщения, профили.
- KV: session tokens.
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

## Cloudflare resources

Создать D1:

```bash
npx wrangler login
npx wrangler d1 create freechat-db
```

Создать KV для сессий:

```bash
npx wrangler kv namespace create SESSIONS
```

Wrangler выведет `database_id` и KV `id`. Их надо вставить в `wrangler.toml`:

```toml
[[d1_databases]]
binding = "DB"
database_name = "freechat-db"
database_id = "..."

[[kv_namespaces]]
binding = "SESSIONS"
id = "..."
```

## Применить миграции

```bash
npm run db:remote
```

## Деплой

```bash
npm run deploy
```

`deploy` автоматически пересобирает C/WASM-протокол через `predeploy`.

## Auth security

Сейчас auth уже не просто cookie=username:

- cookie хранит random session token;
- session token хранится в KV только как `sha256(token)` key;
- cookie `HttpOnly`, `SameSite=Lax`, `Secure` на HTTPS;
- пароли новых пользователей хранятся как PBKDF2-SHA256 + salt;
- старые SHA-256 пароли мигрируют на PBKDF2 после успешного логина;
- WebSocket берет username из серверной сессии, а не доверяет клиентскому `set_username`.

Остается добавить позже:

- rate limit на login/register;
- CSRF token для POST-форм;
- R2 для аватаров вместо data URL в D1.
