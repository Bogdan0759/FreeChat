import protocolWasm from "./freechat_protocol.wasm";

export const VERSION = 1;

export const OP = Object.freeze({
  SET_USERNAME: 1,
  JOIN_CHAT: 2,
  SEND_MESSAGE: 3,
  CHATS_LIST: 101,
  CHAT_HISTORY: 102,
  NEW_MESSAGE: 103,
  UPDATE_LAST_MESSAGE: 104,
  USER_JOINED: 105,
  ERROR: 255,
});

export const OP_NAME = Object.freeze(Object.fromEntries(
  Object.entries(OP).map(([name, code]) => [code, name.toLowerCase()])
));

export const NAME_OP = Object.freeze({
  set_username: OP.SET_USERNAME,
  join_chat: OP.JOIN_CHAT,
  send_message: OP.SEND_MESSAGE,
  chats_list: OP.CHATS_LIST,
  chat_history: OP.CHAT_HISTORY,
  new_message: OP.NEW_MESSAGE,
  update_last_message: OP.UPDATE_LAST_MESSAGE,
  user_joined: OP.USER_JOINED,
  error: OP.ERROR,
});

const encoder = new TextEncoder();
const decoder = new TextDecoder();
const native = await loadNative();
const scratchPtr = native.fc_scratch_ptr();
const metaPtr = scratchPtr;
const payloadPtr = scratchPtr + native.fc_meta_size();

export function encodePacket(type, data = {}, requestId = 0) {
  const op = typeof type === "number" ? type : NAME_OP[type];
  if (!op) throw new Error("Unknown protocol op: " + type);

  const payload = encodePayload(op, data);
  const frameLen = native.fc_frame_len(payload.byteLength);
  const framePtr = payloadPtr + payload.byteLength;
  ensureMemory(framePtr + frameLen);

  const memory = new Uint8Array(native.memory.buffer);
  memory.set(payload, payloadPtr);

  const written = native.fc_encode(framePtr, frameLen, op, requestId, payloadPtr, payload.byteLength);
  if (!written) throw new Error("FreeChat protocol encode failed");

  return memory.slice(framePtr, framePtr + written).buffer;
}

export async function decodePacket(message) {
  const buffer = await toArrayBuffer(message);
  ensureMemory(payloadPtr + buffer.byteLength);

  const memory = new Uint8Array(native.memory.buffer);
  memory.set(new Uint8Array(buffer), payloadPtr);

  if (!native.fc_decode(payloadPtr, buffer.byteLength, metaPtr)) {
    throw new Error("Invalid FreeChat protocol frame");
  }

  const meta = new DataView(native.memory.buffer, metaPtr, native.fc_meta_size());
  const op = meta.getUint32(0, false);
  const requestId = meta.getUint32(4, false);
  const decodedPayloadPtr = meta.getUint32(8, false);
  const payloadLen = meta.getUint32(12, false);
  const payload = new Uint8Array(native.memory.buffer, decodedPayloadPtr, payloadLen);

  return {
    op,
    type: OP_NAME[op] || "unknown",
    requestId,
    data: decodePayload(op, payload),
  };
}

function encodePayload(op, data) {
  if (op === OP.SET_USERNAME) return encodeStringPayload(data.username);
  if (op === OP.JOIN_CHAT) return encodeU32Payload(data.chat_id);
  if (op === OP.SEND_MESSAGE) return encodeStringPayload(data.message);
  if (op === OP.NEW_MESSAGE) return encodeNewMessage(data);
  if (op === OP.UPDATE_LAST_MESSAGE) return encodeChatString(data.chat_id, data.last_message);
  if (op === OP.USER_JOINED) return encodeChatString(data.chat_id, data.username);

  return encoder.encode(JSON.stringify(data ?? {}));
}

function decodePayload(op, payload) {
  if (op === OP.SET_USERNAME) return { username: decodeStringPayload(payload) };
  if (op === OP.JOIN_CHAT) return { chat_id: decodeU32Payload(payload) };
  if (op === OP.SEND_MESSAGE) return { message: decodeStringPayload(payload) };
  if (op === OP.NEW_MESSAGE) return decodeNewMessage(payload);
  if (op === OP.UPDATE_LAST_MESSAGE) {
    const value = decodeChatString(payload);
    return { chat_id: value.chat_id, last_message: value.text };
  }
  if (op === OP.USER_JOINED) {
    const value = decodeChatString(payload);
    return { chat_id: value.chat_id, username: value.text };
  }

  return payload.byteLength ? JSON.parse(decoder.decode(payload)) : {};
}

function encodeStringPayload(value) {
  const text = encoder.encode(String(value || ""));
  const bytes = new Uint8Array(4 + text.byteLength);
  new DataView(bytes.buffer).setUint32(0, text.byteLength, false);
  bytes.set(text, 4);
  return bytes;
}

function decodeStringPayload(payload) {
  if (payload.byteLength < 4) return "";
  const view = new DataView(payload.buffer, payload.byteOffset, payload.byteLength);
  const len = view.getUint32(0, false);
  return decoder.decode(payload.subarray(4, 4 + len));
}

function encodeU32Payload(value) {
  const bytes = new Uint8Array(4);
  new DataView(bytes.buffer).setUint32(0, Number(value) || 0, false);
  return bytes;
}

function decodeU32Payload(payload) {
  if (payload.byteLength < 4) return 0;
  return new DataView(payload.buffer, payload.byteOffset, payload.byteLength).getUint32(0, false);
}

function encodeChatString(chatId, textValue) {
  const text = encoder.encode(String(textValue || ""));
  const bytes = new Uint8Array(8 + text.byteLength);
  const view = new DataView(bytes.buffer);
  view.setUint32(0, Number(chatId) || 0, false);
  view.setUint32(4, text.byteLength, false);
  bytes.set(text, 8);
  return bytes;
}

function decodeChatString(payload) {
  if (payload.byteLength < 8) return { chat_id: 0, text: "" };
  const view = new DataView(payload.buffer, payload.byteOffset, payload.byteLength);
  const chatId = view.getUint32(0, false);
  const len = view.getUint32(4, false);
  return { chat_id: chatId, text: decoder.decode(payload.subarray(8, 8 + len)) };
}

function encodeNewMessage(data) {
  const timestamp = encoder.encode(String(data.timestamp || ""));
  const nick = encoder.encode(String(data.nick || ""));
  const message = encoder.encode(String(data.message || ""));
  const bytes = new Uint8Array(16 + timestamp.byteLength + nick.byteLength + message.byteLength);
  const view = new DataView(bytes.buffer);
  view.setUint32(0, Number(data.chat_id) || 0, false);
  view.setUint32(4, timestamp.byteLength, false);
  view.setUint32(8, nick.byteLength, false);
  view.setUint32(12, message.byteLength, false);
  let offset = 16;
  bytes.set(timestamp, offset); offset += timestamp.byteLength;
  bytes.set(nick, offset); offset += nick.byteLength;
  bytes.set(message, offset);
  return bytes;
}

function decodeNewMessage(payload) {
  if (payload.byteLength < 16) return { chat_id: 0, timestamp: "", nick: "", message: "" };
  const view = new DataView(payload.buffer, payload.byteOffset, payload.byteLength);
  const chatId = view.getUint32(0, false);
  const timestampLen = view.getUint32(4, false);
  const nickLen = view.getUint32(8, false);
  const messageLen = view.getUint32(12, false);
  let offset = 16;
  const timestamp = decoder.decode(payload.subarray(offset, offset + timestampLen)); offset += timestampLen;
  const nick = decoder.decode(payload.subarray(offset, offset + nickLen)); offset += nickLen;
  const message = decoder.decode(payload.subarray(offset, offset + messageLen));
  return { chat_id: chatId, timestamp, nick, message };
}

async function loadNative() {
  if (protocolWasm instanceof WebAssembly.Module) {
    return new WebAssembly.Instance(protocolWasm, {}).exports;
  }

  const result = await WebAssembly.instantiate(protocolWasm, {});
  return (result.instance || result).exports;
}

function ensureMemory(bytesNeeded) {
  const pageSize = 65536;
  const memory = native.memory;
  if (memory.buffer.byteLength >= bytesNeeded) return;

  const missing = bytesNeeded - memory.buffer.byteLength;
  memory.grow(Math.ceil(missing / pageSize));
}

async function toArrayBuffer(message) {
  if (message instanceof ArrayBuffer) return message;
  if (ArrayBuffer.isView(message)) {
    return message.buffer.slice(message.byteOffset, message.byteOffset + message.byteLength);
  }
  if (typeof Blob !== "undefined" && message instanceof Blob) return message.arrayBuffer();
  if (typeof message === "string") return encoder.encode(message).buffer;
  throw new Error("Unsupported frame type");
}
