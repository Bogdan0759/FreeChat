import { getChats, getHistory, saveMessage } from "../data/chatStore.js";
import { decodePacket, encodePacket } from "../protocol/index.js";
import { shortMessage } from "../utils/input.js";

export class ChatRoom {
  constructor(ctx, env) {
    this.ctx = ctx;
    this.env = env;
  }

  async fetch(request) {
    if (request.headers.get("Upgrade") !== "websocket") {
      return new Response("Expected websocket", { status: 426 });
    }

    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);
    server.serializeAttachment({ username: null, chatId: null });
    this.ctx.acceptWebSocket(server);

    return new Response(null, { status: 101, webSocket: client });
  }

  async webSocketMessage(ws, rawMessage) {
    let packet;
    try {
      packet = await decodePacket(rawMessage);
    } catch (error) {
      this.send(ws, "error", { message: error.message });
      return;
    }

    const session = ws.deserializeAttachment() || {};
    const data = packet.data || {};

    if (packet.type === "set_username") {
      await this.setUsername(ws, session, data);
      return;
    }

    if (packet.type === "join_chat") {
      await this.joinChat(ws, session, data);
      return;
    }

    if (packet.type === "send_message") {
      await this.sendMessage(session, data);
    }
  }

  async setUsername(ws, session, data) {
    session.username = String(data.username || "").trim();
    ws.serializeAttachment(session);
    this.send(ws, "chats_list", await getChats(this.env.DB));
  }

  async joinChat(ws, session, data) {
    const chatId = Number(data.chat_id);
    if (!Number.isInteger(chatId)) return;

    session.chatId = chatId;
    ws.serializeAttachment(session);

    this.send(ws, "chat_history", {
      chat_id: chatId,
      messages: await getHistory(this.env.DB, chatId),
    });

    this.broadcast("user_joined", {
      username: session.username || "Anonymous",
      chat_id: chatId,
    }, { skipWs: ws, chatId });
  }

  async sendMessage(session, data) {
    const message = String(data.message || "").trim();
    if (!message || !session.username || session.chatId === null || session.chatId === undefined) return;

    const payload = await saveMessage(this.env.DB, session.chatId, session.username, message);
    this.broadcast("new_message", payload, { chatId: session.chatId });
    this.broadcast("update_last_message", {
      chat_id: session.chatId,
      last_message: `${session.username}: ${shortMessage(message)}`,
    });
  }

  send(ws, type, data) {
    ws.send(encodePacket(type, data));
  }

  broadcast(type, data, options = {}) {
    const payload = encodePacket(type, data);
    for (const ws of this.ctx.getWebSockets()) {
      if (ws === options.skipWs) continue;

      const session = ws.deserializeAttachment() || {};
      if (options.chatId !== undefined && session.chatId !== options.chatId) continue;

      ws.send(payload);
    }
  }
}
