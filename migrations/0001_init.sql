create table if not exists users (
  username text primary key,
  password_hash text not null,
  created_at text not null default current_timestamp
);

create table if not exists chats (
  id integer primary key,
  name text not null,
  description text not null
);

create table if not exists messages (
  id integer primary key autoincrement,
  chat_id integer not null,
  nick text not null,
  message text not null,
  timestamp text not null default current_timestamp
);

create table if not exists profiles (
  username text primary key,
  avatar text not null,
  bio text not null default '',
  created_at text not null default current_timestamp
);

insert or ignore into users(username, password_hash) values
  ('admin', '8d969eef6ecad3c29a3a629280e686cf0c3f5d5a86aff3ca12020c923adc6c92'),
  ('alice', '4e40e8ffe0ee32fa53e139147ed559229a5930f89c2204706fc174beb36210b3'),
  ('bob', '8d059c3640b97180dd2ee453e20d34ab0cb0f2eccbe87d01915a8e578a202b11');

insert or ignore into chats(id, name, description) values
  (0, 'Важное', 'Важное: правила и объявления'),
  (1, 'Общение/Оффтоп', 'Общение/Оффтоп: свободное общение'),
  (2, 'Linux/Windows', 'Linux/Windows: обсуждение ОС'),
  (3, 'Программирование', 'Программирование: код и алгоритмы');
