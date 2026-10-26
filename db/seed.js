"use strict";

const bcrypt = require("bcryptjs");
const db = require("./index");
const config = require("../shared/config");
const { letterFromScore } = require("../shared/grade");

const DEV_PASSWORD = "Password123!";
const BCRYPT_COST = 10;

const USERS = [
  { username: "admin1", role: "admin", nama: "Admin Prodi", nim: null, deviceId: "DEV-ADMIN-01" },
  { username: "dosen1", role: "dosen", nama: "Dosen Satu", nim: null, deviceId: "DEV-DOSEN-01" },
  { username: "dosen2", role: "dosen", nama: "Dosen Dua", nim: null, deviceId: "DEV-DOSEN-02" },
  { username: "mhs1", role: "mahasiswa", nama: "Mahasiswa Satu", nim: "2470001", deviceId: "DEV-MHS-01" },
  { username: "mhs2", role: "mahasiswa", nama: "Mahasiswa Dua", nim: "2470002", deviceId: "DEV-MHS-02" },
  { username: "mhs3", role: "mahasiswa", nama: "Mahasiswa Tiga", nim: "2470003", deviceId: "DEV-MHS-03" },
];

const KELAS = [
  { kode_mk: "IF101", nama_mk: "Pemrograman Web", dosen: "dosen1" },
  { kode_mk: "IF102", nama_mk: "Basis Data", dosen: "dosen2" },
];

const NILAI_ANGKA = { mhs1: 95, mhs2: 88, mhs3: 70 };

function nowEpochSec() {
  return Math.floor(Date.now() / 1000);
}

const seedAll = db.transaction(() => {
  db.prepare("DELETE FROM nilai").run();
  db.prepare("DELETE FROM kelas").run();
  db.prepare("DELETE FROM devices").run();
  db.prepare("DELETE FROM refresh_tokens").run();
  db.prepare("DELETE FROM users").run();
  db.prepare("DELETE FROM service_clients").run();

  const insertUser = db.prepare(
    "INSERT INTO users (username, password_hash, nama, role, nim) VALUES (?, ?, ?, ?, ?)"
  );
  const insertDevice = db.prepare(
    "INSERT INTO devices (user_id, device_id) VALUES (?, ?)"
  );
  const insertServiceClient = db.prepare(
    "INSERT INTO service_clients (client_id, secret_hash, nama) VALUES (?, ?, ?)"
  );
  const insertKelas = db.prepare(
    "INSERT INTO kelas (kode_mk, nama_mk, dosen_id) VALUES (?, ?, ?)"
  );
  const insertNilai = db.prepare(
    "INSERT INTO nilai (kelas_id, mahasiswa_id, nilai_angka, nilai_huruf, status, updated_at) VALUES (?, ?, ?, ?, 'draft', ?)"
  );

  const userIdByUsername = new Map();
  for (const user of USERS) {
    const result = insertUser.run(user.username, bcrypt.hashSync(DEV_PASSWORD, BCRYPT_COST), user.nama, user.role, user.nim);
    userIdByUsername.set(user.username, result.lastInsertRowid);
    insertDevice.run(result.lastInsertRowid, user.deviceId);
  }

  insertServiceClient.run(
    config.serviceClientId,
    bcrypt.hashSync(config.serviceClientSecret, BCRYPT_COST),
    "Service Nilai"
  );

  const updatedAt = nowEpochSec();
  for (const kelas of KELAS) {
    const kelasResult = insertKelas.run(kelas.kode_mk, kelas.nama_mk, userIdByUsername.get(kelas.dosen));
    for (const user of USERS) {
      if (user.role !== "mahasiswa") continue;
      const angka = NILAI_ANGKA[user.username];
      insertNilai.run(kelasResult.lastInsertRowid, userIdByUsername.get(user.username), angka, letterFromScore(angka), updatedAt);
    }
  }
});

seedAll();
db.close();
console.log("seed selesai: 6 users, 6 devices, 1 service client, 2 kelas, 6 nilai draft");
