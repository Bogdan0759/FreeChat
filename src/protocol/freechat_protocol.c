typedef unsigned char u8;
typedef unsigned int u32;

#define FC_MAGIC_1 0x46
#define FC_MAGIC_2 0x43
#define FC_VERSION 1
#define FC_HEADER_SIZE 10
#define FC_SCRATCH_PTR 1024

u32 fc_header_size(void) {
  return FC_HEADER_SIZE;
}

u32 fc_scratch_ptr(void) {
  return FC_SCRATCH_PTR;
}

void fc_write_header(u32 ptr, u32 op, u32 request_id, u32 payload_len) {
  u8 *p = (u8 *)ptr;
  p[0] = FC_MAGIC_1;
  p[1] = FC_MAGIC_2;
  p[2] = FC_VERSION;
  p[3] = (u8)(op & 0xff);
  p[4] = (u8)((request_id >> 8) & 0xff);
  p[5] = (u8)(request_id & 0xff);
  p[6] = (u8)((payload_len >> 24) & 0xff);
  p[7] = (u8)((payload_len >> 16) & 0xff);
  p[8] = (u8)((payload_len >> 8) & 0xff);
  p[9] = (u8)(payload_len & 0xff);
}

u32 fc_payload_len(u32 ptr) {
  u8 *p = (u8 *)ptr;
  return ((u32)p[6] << 24) | ((u32)p[7] << 16) | ((u32)p[8] << 8) | (u32)p[9];
}

u32 fc_request_id(u32 ptr) {
  u8 *p = (u8 *)ptr;
  return ((u32)p[4] << 8) | (u32)p[5];
}

u32 fc_op(u32 ptr) {
  return ((u8 *)ptr)[3];
}

u32 fc_validate_header(u32 ptr, u32 frame_len) {
  if (frame_len < FC_HEADER_SIZE) return 0;

  u8 *p = (u8 *)ptr;
  if (p[0] != FC_MAGIC_1 || p[1] != FC_MAGIC_2) return 0;
  if (p[2] != FC_VERSION) return 0;
  if (FC_HEADER_SIZE + fc_payload_len(ptr) != frame_len) return 0;

  return 1;
}
