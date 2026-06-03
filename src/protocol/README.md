# FreeChat Protocol

Мини-протокол для WebSocket-трафика FreeChat. Framing, encode и decode вынесены в C и собираются в WebAssembly для Cloudflare Workers. JS-обертка выбирает payload-схему и переводит строки в UTF-8 bytes.

Фрейм бинарный:

```text
0..1   magic: "FC"
2      version: 1
3      op code
4..5   request id, uint16 BE
6..9   payload length, uint32 BE
10..   payload bytes
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

Binary payloads:

```text
set_username:
  username_len: u32
  username: utf8

join_chat:
  chat_id: u32

send_message:
  message_len: u32
  message: utf8

new_message:
  chat_id: u32
  timestamp_len: u32
  nick_len: u32
  message_len: u32
  timestamp: utf8
  nick: utf8
  message: utf8

update_last_message:
  chat_id: u32
  last_message_len: u32
  last_message: utf8

user_joined:
  chat_id: u32
  username_len: u32
  username: utf8
```

JSON fallback payloads:

- `chats_list`
- `chat_history`
- `error`

Файлы:

- `freechat_protocol.c` - C-реализация wire protocol frame encode/decode.
- `freechat_protocol.wasm` - скомпилированный WASM-модуль для Worker.
- `index.js` - JS-обертка для Worker-кода и payload-схем.

Пересобрать WASM:

```bash
npm run build:protocol
```

Это транспортный протокол, а не storage engine. D1 все еще хранит пользователей, чаты и историю.
