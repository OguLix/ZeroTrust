"use strict";

const bcrypt = require("bcryptjs");
const db = require("./index");
const config = require("../shared/config");
const { letterFromScore } = require("../shared/grade");

const DEV_PASSWORD = "Password123!";
const BCRYPT_COST = 10;

const USERS = [
  { id: 1, username: "admin1", role: "admin", nama: "Admin Prodi", nim: null, deviceId: "DEV-ADMIN-01" },
  { id: 2, username: "dosen1", role: "dosen", nama: "Dosen Satu", nim: null, deviceId: "DEV-DOSEN-01" },
  { id: 3, username: "dosen2", role: "dosen", nama: "Dosen Dua", nim: null, deviceId: "DEV-DOSEN-02" },
  { id: 4, username: "mhs1", role: "mahasiswa", nama: "Mahasiswa Satu", nim: "2470001", deviceId: "DEV-MHS-01" },
  { id: 5, username: "mhs2", role: "mahasiswa", nama: "Mahasiswa Dua", nim: "2470002", deviceId: "DEV-MHS-02" },
  { id: 6, username: "mhs3", role: "mahasiswa", nama: "Mahasiswa Tiga", nim: "2470003", deviceId: "DEV-MHS-03" },
];

const KELAS = [
  { id: 1, kode_mk: "IF101", nama_mk: "Pemrograman Web", dosenId: 2 },
  { id: 2, kode_mk: "IF102", nama_mk: "Basis Data", dosenId: 3 },
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
    "INSERT INTO users (id, username, password_hash, nama, role, nim) VALUES (?, ?, ?, ?, ?, ?)"
  );
  const insertDevice = db.prepare(
    "INSERT INTO devices (id, user_id, device_id) VALUES (?, ?, ?)"
  );
  const insertServiceClient = db.prepare(
    "INSERT INTO service_clients (id, client_id, secret_hash, nama) VALUES (?, ?, ?, ?)"
  );
  const insertKelas = db.prepare(
    "INSERT INTO kelas (id, kode_mk, nama_mk, dosen_id) VALUES (?, ?, ?, ?)"
  );
  const insertNilai = db.prepare(
    "INSERT INTO nilai (id, kelas_id, mahasiswa_id, nilai_angka, nilai_huruf, status, updated_at) VALUES (?, ?, ?, ?, ?, 'draft', ?)"
  );

  for (const user of USERS) {
    insertUser.run(user.id, user.username, bcrypt.hashSync(DEV_PASSWORD, BCRYPT_COST), user.nama, user.role, user.nim);
    insertDevice.run(user.id, user.id, user.deviceId);
  }

  insertServiceClient.run(1, config.serviceClientId, bcrypt.hashSync(config.serviceClientSecret, BCRYPT_COST), "Service Nilai");

  const updatedAt = nowEpochSec();
  for (const kelas of KELAS) {
    insertKelas.run(kelas.id, kelas.kode_mk, kelas.nama_mk, kelas.dosenId);
    let barisNilai = 0;
    for (const user of USERS) {
      if (user.role !== "mahasiswa") continue;
      barisNilai++;
      const angka = NILAI_ANGKA[user.username];
      insertNilai.run(
        (kelas.id - 1) * 3 + barisNilai,
        kelas.id,
        user.id,
        angka,
        letterFromScore(angka),
        updatedAt
      );
    }
  }
});

seedAll();
db.close();
console.log("seed selesai: 6 users, 6 devices, 1 service client, 2 kelas, 6 nilai draft");
