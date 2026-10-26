CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  nama TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('mahasiswa','dosen','admin')),
  nim TEXT UNIQUE,
  CHECK ((role = 'mahasiswa' AND nim IS NOT NULL) OR (role <> 'mahasiswa' AND nim IS NULL))
);

CREATE TABLE IF NOT EXISTS devices (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  device_id TEXT NOT NULL,
  label TEXT,
  UNIQUE (user_id, device_id)
);

CREATE TABLE IF NOT EXISTS service_clients (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  client_id TEXT NOT NULL UNIQUE,
  secret_hash TEXT NOT NULL,
  nama TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS refresh_tokens (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  device_id TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  revoked_at INTEGER
);

CREATE TABLE IF NOT EXISTS kelas (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  kode_mk TEXT NOT NULL,
  nama_mk TEXT NOT NULL,
  dosen_id INTEGER NOT NULL REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS nilai (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  kelas_id INTEGER NOT NULL REFERENCES kelas(id),
  mahasiswa_id INTEGER NOT NULL REFERENCES users(id),
  nilai_angka REAL CHECK (nilai_angka IS NULL OR (nilai_angka >= 0 AND nilai_angka <= 100)),
  nilai_huruf TEXT,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','final')),
  updated_at INTEGER NOT NULL,
  UNIQUE (kelas_id, mahasiswa_id)
);

CREATE TABLE IF NOT EXISTS transkrip (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nim TEXT NOT NULL,
  kelas_id INTEGER NOT NULL,
  kode_mk TEXT NOT NULL,
  nama_mk TEXT NOT NULL,
  nilai_angka REAL NOT NULL,
  nilai_huruf TEXT NOT NULL,
  synced_at INTEGER NOT NULL,
  UNIQUE (nim, kelas_id)
);

CREATE TABLE IF NOT EXISTS audit_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ts TEXT NOT NULL,
  subject TEXT,
  subject_type TEXT NOT NULL CHECK (subject_type IN ('user','service','anonymous')),
  method TEXT NOT NULL,
  endpoint TEXT NOT NULL,
  device_id TEXT,
  decision TEXT NOT NULL CHECK (decision IN ('allow','deny')),
  reason TEXT NOT NULL
);
