"use strict";

const express = require("express");
const db = require("../db/index");
const config = require("../shared/config");
const { letterFromScore } = require("../shared/grade");
const { verifyAuth, requireRole } = require("./middleware");
const { getServiceToken } = require("./transkripClient");

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
  const error = status === 400 ? "bad_request" : status === 404 ? "not_found" : "forbidden";
  return res.status(status).json({ error, reason });
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

router.post("/kelas/:id/finalisasi", verifyAuth, requireRole("dosen"), async (req, res) => {
  if (!validIdParam(req.params.id)) {
    return send(res, 400, "INVALID_PARAM");
  }
  const id = Number(req.params.id);
  const kelas = db.prepare("SELECT id, dosen_id, kode_mk, nama_mk FROM kelas WHERE id = ?").get(id);
  if (!kelas) {
    return res.status(404).json({ error: "not_found", reason: "RESOURCE_NOT_FOUND" });
  }
  if (kelas.dosen_id !== authUserId(req)) {
    return send(res, 403, "NOT_CLASS_OWNER");
  }

  const rows = db.prepare("SELECT n.id, n.mahasiswa_id, n.nilai_angka, n.nilai_huruf, n.status FROM nilai n WHERE n.kelas_id = ?").all(id);
  const drafts = rows.filter((row) => row.status === "draft");
  if (drafts.length === 0) {
    return res.status(409).json({ error: "conflict", reason: "ALREADY_FINAL" });
  }
  if (rows.some((row) => row.nilai_angka === null || row.nilai_angka === undefined)) {
    return res.status(422).json({ error: "unprocessable", reason: "NILAI_INCOMPLETE" });
  }

  const now = Math.floor(Date.now() / 1000);
  const changed = [];
  const updateFinal = db.prepare("UPDATE nilai SET status = 'final', updated_at = ? WHERE id = ? AND status = 'draft'");
  for (const row of drafts) {
    const info = updateFinal.run(now, row.id);
    if (info.changes > 0) changed.push(row.id);
  }

  try {
    const token = await getServiceToken();
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    let response;
    try {
      response = await fetch(config.url.gateway + "/transkrip/sinkron", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: "Bearer " + token,
        },
        body: JSON.stringify({
          kelas_id: id,
          kode_mk: kelas.kode_mk,
          nama_mk: kelas.nama_mk,
          entries: rows.map((row) => {
            const user = db.prepare("SELECT nim FROM users WHERE id = ?").get(row.mahasiswa_id);
            return {
              nim: user.nim,
              nilai_angka: row.nilai_angka,
              nilai_huruf: row.nilai_huruf,
            };
          }),
        }),
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timeout);
    }
    if (!response.ok) {
      throw new Error("sync failed with status " + response.status);
    }
    await response.json();
    res.json({ kelas_id: id, status: "final", finalized: changed.length, synced: true });
  } catch (err) {
    const revertNow = Math.floor(Date.now() / 1000);
    const revertDraft = db.prepare("UPDATE nilai SET status = 'draft', updated_at = ? WHERE id = ? AND status = 'final'");
    for (const rowId of changed) {
      revertDraft.run(revertNow, rowId);
    }
    res.status(502).json({ error: "bad_gateway", reason: "TRANSKRIP_SYNC_FAILED" });
  }
});

module.exports = router;
