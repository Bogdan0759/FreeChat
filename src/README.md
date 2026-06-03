# FreeChat source layout

```text
src/
  index.js          Worker entry: exports app + Durable Object class
  app/              HTTP router and route handlers
  data/             D1 queries and persistence functions
  pages/            HTML/CSS/browser client templates
  protocol/         FreeChat wire protocol, C -> WASM + JS wrapper
  realtime/         Durable Object WebSocket room
  utils/            small shared helpers
```

Data flow:

```text
Browser <-> /ws <-> realtime/ChatRoom <-> protocol <-> D1 data store
Browser <-> HTTP routes <-> app handlers <-> D1 data store
```

The custom protocol is transport-only. D1 is still the database layer.
