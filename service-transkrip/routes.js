"use strict";

const express = require("express");
const db = require("../db/index");
const { verifyAuth, requireRole } = require("./middleware");

const router = express.Router();

const NIM_PATTERN = /^[0-9]{5,15}$/;

router.get("/transkrip/:nim", verifyAuth, requireRole("mahasiswa", "admin"), (req, res) => {
  const nim = req.params.nim;
  if (!NIM_PATTERN.test(nim)) {
    return res.status(400).json({ error: "bad_request", reason: "INVALID_PARAM" });
  }
  if (req.auth.role === "mahasiswa") {
    const mhs = db.prepare("SELECT nim FROM users WHERE id = ?").get(Number(req.auth.sub));
    if (!mhs || mhs.nim !== nim) {
      return res.status(403).json({ error: "forbidden", reason: "NOT_OWN_NIM" });
    }
  }
  const entries = db.prepare("SELECT kode_mk, nama_mk, nilai_angka, nilai_huruf FROM transkrip WHERE nim = ? ORDER BY kode_mk").all(nim);
  res.json({ nim, entries });
});

router.post("/transkrip/sinkron", verifyAuth, (req, res) => {
  if (req.auth.typ !== "service") {
    return res.status(403).json({ error: "forbidden", reason: "ROLE_NOT_ALLOWED" });
  }
  const body = req.body || {};
  const kelasId = body.kelas_id;
  if (!Number.isInteger(kelasId) || kelasId < 1) {
    return res.status(400).json({ error: "bad_request", reason: "INVALID_BODY" });
  }
  if (typeof body.kode_mk !== "string" || body.kode_mk === "") {
    return res.status(400).json({ error: "bad_request", reason: "INVALID_BODY" });
  }
  if (typeof body.nama_mk !== "string" || body.nama_mk === "") {
    return res.status(400).json({ error: "bad_request", reason: "INVALID_BODY" });
  }
  if (!Array.isArray(body.entries) || body.entries.length === 0) {
    return res.status(400).json({ error: "bad_request", reason: "INVALID_BODY" });
  }
  for (const entry of body.entries) {
    if (entry === null || typeof entry !== "object") {
      return res.status(400).json({ error: "bad_request", reason: "INVALID_BODY" });
    }
    if (typeof entry.nim !== "string" || !NIM_PATTERN.test(entry.nim)) {
      return res.status(400).json({ error: "bad_request", reason: "INVALID_BODY" });
    }
    if (typeof entry.nilai_angka !== "number" || !Number.isFinite(entry.nilai_angka) || entry.nilai_angka < 0 || entry.nilai_angka > 100) {
      return res.status(400).json({ error: "bad_request", reason: "INVALID_BODY" });
    }
    if (typeof entry.nilai_huruf !== "string" || entry.nilai_huruf === "") {
      return res.status(400).json({ error: "bad_request", reason: "INVALID_BODY" });
    }
  }
  const upsert = db.prepare("INSERT INTO transkrip (nim, kelas_id, kode_mk, nama_mk, nilai_angka, nilai_huruf, synced_at) VALUES (?, ?, ?, ?, ?, ?, ?) ON CONFLICT(nim, kelas_id) DO UPDATE SET kode_mk = excluded.kode_mk, nama_mk = excluded.nama_mk, nilai_angka = excluded.nilai_angka, nilai_huruf = excluded.nilai_huruf, synced_at = excluded.synced_at");
  const syncAll = db.transaction(() => {
    const now = Math.floor(Date.now() / 1000);
    for (const entry of body.entries) {
      upsert.run(entry.nim, kelasId, body.kode_mk, body.nama_mk, entry.nilai_angka, entry.nilai_huruf, now);
    }
  });
  syncAll();
  res.json({ synced: body.entries.length });
});

module.exports = router;
