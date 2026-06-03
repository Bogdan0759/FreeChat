export function cleanName(value) {
  return String(value || "").trim().slice(0, 40);
}

export function shortMessage(message, limit = 30) {
  return message.length > limit ? message.slice(0, limit - 3) + "..." : message;
}
