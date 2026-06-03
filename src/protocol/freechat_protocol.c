typedef unsigned char u8;
typedef unsigned int u32;

#define FC_MAGIC_1 0x46
#define FC_MAGIC_2 0x43
#define FC_VERSION 1
#define FC_HEADER_SIZE 10
#define FC_SCRATCH_PTR 1024
#define FC_META_SIZE 16

u32 fc_header_size(void) {
  return FC_HEADER_SIZE;
}

u32 fc_meta_size(void) {
  return FC_META_SIZE;
}

u32 fc_scratch_ptr(void) {
  return FC_SCRATCH_PTR;
}

u32 fc_frame_len(u32 payload_len) {
  return FC_HEADER_SIZE + payload_len;
}

void fc_memcpy(u32 dst, u32 src, u32 len) {
  u8 *d = (u8 *)dst;
  u8 *s = (u8 *)src;
  for (u32 i = 0; i < len; i++) d[i] = s[i];
}

void fc_write_u32_be(u32 ptr, u32 value) {
  u8 *p = (u8 *)ptr;
  p[0] = (u8)((value >> 24) & 0xff);
  p[1] = (u8)((value >> 16) & 0xff);
  p[2] = (u8)((value >> 8) & 0xff);
  p[3] = (u8)(value & 0xff);
}

u32 fc_read_u32_be(u32 ptr) {
  u8 *p = (u8 *)ptr;
  return ((u32)p[0] << 24) | ((u32)p[1] << 16) | ((u32)p[2] << 8) | (u32)p[3];
}

u32 fc_encode(u32 frame_ptr, u32 frame_capacity, u32 op, u32 request_id, u32 payload_ptr, u32 payload_len) {
  if (op > 255) return 0;
  if (request_id > 65535) return 0;
  if (frame_capacity < FC_HEADER_SIZE + payload_len) return 0;

  u8 *frame = (u8 *)frame_ptr;
  frame[0] = FC_MAGIC_1;
  frame[1] = FC_MAGIC_2;
  frame[2] = FC_VERSION;
  frame[3] = (u8)(op & 0xff);
  frame[4] = (u8)((request_id >> 8) & 0xff);
  frame[5] = (u8)(request_id & 0xff);
  frame[6] = (u8)((payload_len >> 24) & 0xff);
  frame[7] = (u8)((payload_len >> 16) & 0xff);
  frame[8] = (u8)((payload_len >> 8) & 0xff);
  frame[9] = (u8)(payload_len & 0xff);

  fc_memcpy(frame_ptr + FC_HEADER_SIZE, payload_ptr, payload_len);
  return FC_HEADER_SIZE + payload_len;
}

u32 fc_decode(u32 frame_ptr, u32 frame_len, u32 meta_ptr) {
  if (frame_len < FC_HEADER_SIZE) return 0;

  u8 *frame = (u8 *)frame_ptr;
  if (frame[0] != FC_MAGIC_1 || frame[1] != FC_MAGIC_2) return 0;
  if (frame[2] != FC_VERSION) return 0;

  u32 payload_len = ((u32)frame[6] << 24) | ((u32)frame[7] << 16) | ((u32)frame[8] << 8) | (u32)frame[9];
  if (FC_HEADER_SIZE + payload_len != frame_len) return 0;

  u32 request_id = ((u32)frame[4] << 8) | (u32)frame[5];

  // meta layout: op, request_id, payload_ptr, payload_len
  fc_write_u32_be(meta_ptr, (u32)frame[3]);
  fc_write_u32_be(meta_ptr + 4, request_id);
  fc_write_u32_be(meta_ptr + 8, frame_ptr + FC_HEADER_SIZE);
  fc_write_u32_be(meta_ptr + 12, payload_len);

  return 1;
}
