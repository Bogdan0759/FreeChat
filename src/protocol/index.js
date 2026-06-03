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
const headerSize = native.fc_header_size();
const scratchPtr = native.fc_scratch_ptr();

export function encodePacket(type, data = {}, requestId = 0) {
  const op = typeof type === "number" ? type : NAME_OP[type];
  if (!op) throw new Error("Unknown protocol op: " + type);

  const payload = encoder.encode(JSON.stringify(data ?? {}));
  native.fc_write_header(scratchPtr, op, requestId, payload.byteLength);

  const memory = new Uint8Array(native.memory.buffer);
  const buffer = new ArrayBuffer(headerSize + payload.byteLength);
  const bytes = new Uint8Array(buffer);
  bytes.set(memory.slice(scratchPtr, scratchPtr + headerSize), 0);
  bytes.set(payload, headerSize);

  return buffer;
}

export async function decodePacket(message) {
  const buffer = await toArrayBuffer(message);
  if (buffer.byteLength < headerSize) throw new Error("Frame is too small");

  const memory = new Uint8Array(native.memory.buffer);
  memory.set(new Uint8Array(buffer, 0, headerSize), scratchPtr);

  if (!native.fc_validate_header(scratchPtr, buffer.byteLength)) {
    throw new Error("Invalid FreeChat protocol frame");
  }

  const op = native.fc_op(scratchPtr);
  const requestId = native.fc_request_id(scratchPtr);
  const length = native.fc_payload_len(scratchPtr);
  const payload = new Uint8Array(buffer, headerSize, length);
  const data = length ? JSON.parse(decoder.decode(payload)) : {};

  return {
    op,
    type: OP_NAME[op] || "unknown",
    requestId,
    data,
  };
}

async function loadNative() {
  if (protocolWasm instanceof WebAssembly.Module) {
    return new WebAssembly.Instance(protocolWasm, {}).exports;
  }

  const result = await WebAssembly.instantiate(protocolWasm, {});
  return (result.instance || result).exports;
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
