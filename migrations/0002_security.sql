alter table users add column password_salt text;
alter table users add column password_version integer not null default 1;

create table if not exists sessions (
  token_hash text primary key,
  username text not null,
  created_at text not null default current_timestamp,
  expires_at text not null
);

create index if not exists idx_sessions_username on sessions(username);
create index if not exists idx_sessions_expires_at on sessions(expires_at);
