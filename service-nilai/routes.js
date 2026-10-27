"use strict";

const express = require("express");
const db = require("../db/index");
const { letterFromScore } = require("../shared/grade");
const { verifyAuth, requireRole } = require("./middleware");

const router = express.Router();

function validIdParam(raw) {
  if (!/^[0-9]+$/.test(raw)) return false;
  const id = Number(raw);
  return Number.isInteger(id) && id >= 1;
}

function authUserId(req) {
  return Number(req.auth.sub);
}

function send(res, status, reason) {
  return res.status(status).json({ error: reason === "INVALID_BODY" || reason === "INVALID_PARAM" ? "bad_request" : "forbidden", reason });
}

router.get("/nilai", verifyAuth, requireRole("mahasiswa", "dosen"), (req, res) => {
  const base = "SELECT n.id, n.kelas_id, k.kode_mk, k.nama_mk, u.nama AS mahasiswa, u.nim AS nim, n.nilai_angka, n.nilai_huruf, n.status, n.updated_at FROM nilai n JOIN kelas k ON k.id = n.kelas_id JOIN users u ON u.id = n.mahasiswa_id";
  const isMahasiswa = req.auth.role === "mahasiswa";
  const rows = isMahasiswa
    ? db.prepare(base + " WHERE n.mahasiswa_id = ? ORDER BY n.id").all(authUserId(req))
    : db.prepare(base + " WHERE k.dosen_id = ? ORDER BY n.id").all(authUserId(req));
  res.json(rows);
});

router.put("/nilai/:id", verifyAuth, requireRole("dosen"), (req, res) => {
  if (!validIdParam(req.params.id)) {
    return send(res, 400, "INVALID_PARAM");
  }
  const id = Number(req.params.id);
  const body = req.body || {};
  const angka = body.nilai_angka;
  if (typeof angka !== "number" || !Number.isFinite(angka) || angka < 0 || angka > 100) {
    return send(res, 400, "INVALID_BODY");
  }
  const row = db.prepare("SELECT id, kelas_id, status FROM nilai WHERE id = ?").get(id);
  if (!row) {
    return res.status(404).json({ error: "not_found", reason: "RESOURCE_NOT_FOUND" });
  }
  const kelas = db.prepare("SELECT dosen_id FROM kelas WHERE id = ?").get(row.kelas_id);
  if (!kelas || kelas.dosen_id !== authUserId(req)) {
    return send(res, 403, "NOT_CLASS_OWNER");
  }
  if (row.status === "final") {
    return send(res, 403, "NILAI_ALREADY_FINAL");
  }
  const huruf = letterFromScore(angka);
  db.prepare("UPDATE nilai SET nilai_angka = ?, nilai_huruf = ?, updated_at = ? WHERE id = ?").run(angka, huruf, Math.floor(Date.now() / 1000), id);
  const updated = db.prepare("SELECT n.id, n.kelas_id, k.kode_mk, k.nama_mk, u.nama AS mahasiswa, u.nim AS nim, n.nilai_angka, n.nilai_huruf, n.status, n.updated_at FROM nilai n JOIN kelas k ON k.id = n.kelas_id JOIN users u ON u.id = n.mahasiswa_id WHERE n.id = ?").get(id);
  res.json(updated);
});

router.post("/kelas/:id/finalisasi", verifyAuth, requireRole("dosen"), (req, res) => {
  if (!validIdParam(req.params.id)) {
    return send(res, 400, "INVALID_PARAM");
  }
  const id = Number(req.params.id);
  const kelas = db.prepare("SELECT id, dosen_id FROM kelas WHERE id = ?").get(id);
  if (!kelas) {
    return res.status(404).json({ error: "not_found", reason: "RESOURCE_NOT_FOUND" });
  }
  if (kelas.dosen_id !== authUserId(req)) {
    return send(res, 403, "NOT_CLASS_OWNER");
  }
  const result = db.prepare("UPDATE nilai SET status = 'final', updated_at = ? WHERE kelas_id = ? AND status = 'draft'").run(Math.floor(Date.now() / 1000), id);
  res.json({ kelas_id: id, status: "final", finalized: result.changes, transkrip_synced: false });
});

module.exports = router;
