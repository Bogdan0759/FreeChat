# FreeChat Protocol

Мини-протокол для WebSocket-трафика FreeChat. Серверная часть кодирования/валидации заголовка вынесена в C и собирается в WebAssembly для Cloudflare Workers.

Фрейм бинарный:

```text
0..1   magic: "FC"
2      version: 1
3      op code
4..5   request id, uint16 BE
6..9   payload length, uint32 BE
10..   JSON payload, UTF-8
```

OP codes:

- `1` - `set_username`
- `2` - `join_chat`
- `3` - `send_message`
- `101` - `chats_list`
- `102` - `chat_history`
- `103` - `new_message`
- `104` - `update_last_message`
- `105` - `user_joined`
- `255` - `error`

Файлы:

- `freechat_protocol.c` - C-реализация заголовка протокола.
- `freechat_protocol.wasm` - скомпилированный WASM-модуль для Worker.
- `index.js` - JS-обертка: JSON payload + C/WASM header encode/decode.

Пересобрать WASM:

```bash
npm run build:protocol
```

Это транспортный протокол, а не storage engine. D1 все еще хранит пользователей, чаты и историю.
