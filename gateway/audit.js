"use strict";

const db = require("../db/index");

const insertAudit = db.prepare(
  "INSERT INTO audit_log (ts, subject, subject_type, method, endpoint, device_id, decision, reason) VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
);

const selectRecentAudit = db.prepare(
  "SELECT ts, subject, subject_type, method, endpoint, device_id, decision, reason FROM audit_log ORDER BY id DESC LIMIT ?"
);

function truncate(value, maxLength) {
  if (value === undefined || value === null) {
    return null;
  }
  const text = String(value);
  return text.length > maxLength ? text.slice(0, maxLength) : text;
}

function writeAudit(entry) {
  return insertAudit.run(
    new Date().toISOString(),
    truncate(entry.subject, 64),
    entry.subjectType,
    entry.method,
    String(entry.endpoint).split("?")[0],
    truncate(entry.deviceId, 64),
    entry.decision,
    entry.reason
  );
}

function readRecentAudit(limit) {
  return selectRecentAudit.all(limit);
}

module.exports = { writeAudit, readRecentAudit };
