"use strict";

const db = require("../db/index");
const config = require("../shared/config");
const { isWithinAccessHours } = require("../shared/accessHours");

const getUserById = db.prepare("SELECT id, nim, role FROM users WHERE id = ?");
const getKelasById = db.prepare("SELECT id, dosen_id FROM kelas WHERE id = ?");
const getNilaiById = db.prepare("SELECT id, kelas_id, status FROM nilai WHERE id = ?");

function deny(status, reason) {
  return { allow: false, status, reason };
}

function allow(reason) {
  return { allow: true, status: 200, reason };
}

function toDate(now) {
  if (now instanceof Date) return now;
  if (typeof now === "number") return new Date(now);
  return new Date();
}

function decide(ctx) {
  const method = ctx.method;
  const route = ctx.route;
  const params = ctx.params || {};
  const subject = ctx.subject || {};
  const path = route && route.path;
  const now = toDate(ctx.now);

  if (method === "GET" && path === "/nilai") {
    if (subject.role !== "mahasiswa" && subject.role !== "dosen") {
      return deny(403, "ROLE_NOT_ALLOWED");
    }
    return allow("OK: akses nilai");
  }

  if (method === "PUT" && path === "/nilai/:id") {
    if (subject.role !== "dosen") {
      return deny(403, "ROLE_NOT_ALLOWED");
    }
    const row = getNilaiById.get(Number(params.id));
    if (!row) {
      return deny(404, "RESOURCE_NOT_FOUND");
    }
    const kelas = getKelasById.get(row.kelas_id);
    if (!kelas || kelas.dosen_id !== Number(subject.id)) {
      return deny(403, "NOT_CLASS_OWNER");
    }
    if (row.status === "final") {
      return deny(403, "NILAI_ALREADY_FINAL");
    }
    if (!isWithinAccessHours(now, config.accessHours)) {
      return deny(403, "OUTSIDE_ACCESS_HOURS");
    }
    return allow("OK: dosen mengampu kelas");
  }

  if (method === "POST" && path === "/kelas/:id/finalisasi") {
    if (subject.role !== "dosen") {
      return deny(403, "ROLE_NOT_ALLOWED");
    }
    const kelas = getKelasById.get(Number(params.id));
    if (!kelas) {
      return deny(404, "RESOURCE_NOT_FOUND");
    }
    if (kelas.dosen_id !== Number(subject.id)) {
      return deny(403, "NOT_CLASS_OWNER");
    }
    if (!isWithinAccessHours(now, config.accessHours)) {
      return deny(403, "OUTSIDE_ACCESS_HOURS");
    }
    return allow("OK: finalisasi kelas");
  }

  if (method === "GET" && path === "/transkrip/:nim") {
    if (subject.role === "admin") {
      return allow("OK: admin akses transkrip");
    }
    if (subject.role === "mahasiswa") {
      const user = getUserById.get(Number(subject.id));
      if (!user || user.nim !== params.nim) {
        return deny(403, "NOT_OWN_NIM");
      }
      return allow("OK: mahasiswa akses transkrip sendiri");
    }
    return deny(403, "ROLE_NOT_ALLOWED");
  }

  if (method === "POST" && path === "/transkrip/sinkron") {
    if (subject.type !== "service" || subject.role !== "service") {
      return deny(403, "SERVICE_ONLY");
    }
    return allow("OK: service sinkron transkrip");
  }

  return deny(404, "ROUTE_NOT_FOUND");
}

module.exports = { decide };
