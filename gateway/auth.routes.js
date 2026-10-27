"use strict";

const crypto = require("crypto");
const express = require("express");
const bcrypt = require("bcryptjs");
const db = require("../db/index");
const config = require("../shared/config");
const { signAccessToken, signServiceToken } = require("../shared/jwt");
const { writeAudit } = require("./audit");

const DUMMY_HASH = bcrypt.hashSync("akun-tidak-ada", 10);

const router = express.Router();

router.use(express.json({ limit: "10kb" }));

const getUserByUsername = db.prepare(
  "SELECT id, username, password_hash AS passwordHash, role FROM users WHERE username = ?"
);
const getUserById = db.prepare("SELECT id, role FROM users WHERE id = ?");
const deviceExists = db.prepare(
  "SELECT 1 AS ok FROM devices WHERE user_id = ? AND device_id = ?"
);
const insertRefreshToken = db.prepare(
  "INSERT INTO refresh_tokens (user_id, token_hash, device_id, created_at, expires_at) VALUES (?, ?, ?, ?, ?)"
);
const getRefreshByHash = db.prepare(
  "SELECT id, user_id, device_id, expires_at, revoked_at FROM refresh_tokens WHERE token_hash = ?"
);
const revokeRow = db.prepare(
  "UPDATE refresh_tokens SET revoked_at = ? WHERE id = ? AND revoked_at IS NULL"
);
const revokeAllByUser = db.prepare(
  "UPDATE refresh_tokens SET revoked_at = ? WHERE user_id = ? AND revoked_at IS NULL"
);
const getServiceClient = db.prepare(
  "SELECT id, client_id, secret_hash AS secretHash FROM service_clients WHERE client_id = ?"
);

function nowEpochSec() {
  return Math.floor(Date.now() / 1000);
}

function sha256Hex(value) {
  return crypto.createHash("sha256").update(value, "utf8").digest("hex");
}

function denyAudit(req, subject, subjectType, reason, deviceId) {
  writeAudit({
    subject,
    subjectType,
    method: req.method,
    endpoint: req.originalUrl,
    deviceId,
    decision: "deny",
    reason,
  });
}

function allowAudit(req, subject, subjectType, reason, deviceId) {
  writeAudit({
    subject,
    subjectType,
    method: req.method,
    endpoint: req.originalUrl,
    deviceId,
    decision: "allow",
    reason,
  });
}

function validText(value, maxLength) {
  return typeof value === "string" && value.length > 0 && value.length <= maxLength;
}

router.post("/login", (req, res) => {
  const body = req.body;
  const deviceId = req.get("x-device-id") || "";
  const username = body && body.username;
  const password = body && body.password;
  const attempted = validText(username, 128) ? String(username).slice(0, 64) : "";

  if (!validText(username, 128) || !validText(password, 256)) {
    denyAudit(req, attempted, "anonymous", "INVALID_BODY", deviceId);
    return res.status(400).json({ error: "bad_request", reason: "INVALID_BODY" });
  }
  if (!validText(deviceId, 64)) {
    denyAudit(req, attempted, "anonymous", "MISSING_DEVICE_ID", deviceId);
    return res.status(400).json({ error: "bad_request", reason: "MISSING_DEVICE_ID" });
  }

  const user = getUserByUsername.get(username);
  const passwordOk = bcrypt.compareSync(
    password,
    user ? user.passwordHash : DUMMY_HASH
  );

  if (!user || !passwordOk) {
    denyAudit(
      req,
      attempted,
      "anonymous",
      user ? "WRONG_PASSWORD" : "UNKNOWN_USERNAME",
      deviceId
    );
    return res.status(401).json({ error: "invalid_credentials" });
  }

  const device = deviceExists.get(user.id, deviceId);
  if (!device) {
    denyAudit(req, String(user.id), "user", "DEVICE_NOT_REGISTERED", deviceId);
    return res
      .status(403)
      .json({ error: "forbidden", reason: "DEVICE_NOT_REGISTERED" });
  }

  const refreshToken = crypto.randomBytes(32).toString("hex");
  const now = nowEpochSec();
  insertRefreshToken.run(
    user.id,
    sha256Hex(refreshToken),
    deviceId,
    now,
    now + config.jwt.refreshTtlSec
  );
  allowAudit(req, String(user.id), "user", "OK: login", deviceId);
  return res.status(200).json({
    access_token: signAccessToken(user.id, user.role),
    refresh_token: refreshToken,
    token_type: "Bearer",
    expires_in: config.jwt.accessTtlSec,
  });
});

router.post("/refresh", (req, res) => {
  const deviceId = req.get("x-device-id") || "";
  const refreshToken = req.body && req.body.refresh_token;

  if (!validText(refreshToken, 128)) {
    denyAudit(req, "", "anonymous", "INVALID_BODY", deviceId);
    return res.status(400).json({ error: "bad_request", reason: "INVALID_BODY" });
  }

  const row = getRefreshByHash.get(sha256Hex(refreshToken));

  if (row && row.revoked_at !== null) {
    const now = nowEpochSec();
    revokeAllByUser.run(now, row.user_id);
    denyAudit(req, String(row.user_id), "user", "REFRESH_TOKEN_REUSE", deviceId);
    return res
      .status(401)
      .json({ error: "unauthorized", reason: "REFRESH_TOKEN_REUSE" });
  }

  if (!row) {
    denyAudit(req, "", "anonymous", "INVALID_REFRESH_TOKEN", deviceId);
    return res
      .status(401)
      .json({ error: "unauthorized", reason: "INVALID_REFRESH_TOKEN" });
  }

  const now = nowEpochSec();
  if (row.expires_at <= now) {
    denyAudit(req, String(row.user_id), "user", "REFRESH_TOKEN_EXPIRED", deviceId);
    return res
      .status(401)
      .json({ error: "unauthorized", reason: "REFRESH_TOKEN_EXPIRED" });
  }

  if (row.device_id !== deviceId) {
    denyAudit(req, String(row.user_id), "user", "DEVICE_MISMATCH", deviceId);
    return res
      .status(401)
      .json({ error: "unauthorized", reason: "DEVICE_MISMATCH" });
  }

  revokeRow.run(now, row.id);
  const newRefreshToken = crypto.randomBytes(32).toString("hex");
  insertRefreshToken.run(
    row.user_id,
    sha256Hex(newRefreshToken),
    deviceId,
    now,
    now + config.jwt.refreshTtlSec
  );

  const user = getUserById.get(row.user_id);
  allowAudit(req, String(user.id), "user", "OK: refresh", deviceId);
  return res.status(200).json({
    access_token: signAccessToken(user.id, user.role),
    refresh_token: newRefreshToken,
    token_type: "Bearer",
    expires_in: config.jwt.accessTtlSec,
  });
});

router.post("/logout", (req, res) => {
  const deviceId = req.get("x-device-id") || "";
  const refreshToken = req.body && req.body.refresh_token;

  if (!validText(refreshToken, 128)) {
    denyAudit(req, "", "anonymous", "INVALID_BODY", deviceId);
    return res.status(400).json({ error: "bad_request", reason: "INVALID_BODY" });
  }

  const row = getRefreshByHash.get(sha256Hex(refreshToken));
  if (row) {
    revokeRow.run(nowEpochSec(), row.id);
    if (row.revoked_at === null) {
      allowAudit(req, String(row.user_id), "user", "OK: logout", deviceId);
    } else {
      denyAudit(
        req,
        String(row.user_id),
        "user",
        "REFRESH_TOKEN_REUSE",
        deviceId
      );
    }
  } else {
    denyAudit(req, "", "anonymous", "INVALID_REFRESH_TOKEN", deviceId);
  }
  return res.status(204).end();
});

router.post("/service", (req, res) => {
  const body = req.body;
  const clientId = body && body.client_id;
  const clientSecret = body && body.client_secret;
  const attempted = validText(clientId, 128) ? String(clientId).slice(0, 64) : "";

  if (!validText(clientId, 128) || !validText(clientSecret, 256)) {
    denyAudit(req, attempted, "anonymous", "INVALID_BODY", "");
    return res.status(400).json({ error: "bad_request", reason: "INVALID_BODY" });
  }

  const client = getServiceClient.get(clientId);
  const secretOk = bcrypt.compareSync(
    clientSecret,
    client ? client.secretHash : DUMMY_HASH
  );

  if (!client || !secretOk) {
    denyAudit(req, attempted, "anonymous", "INVALID_SERVICE_CREDENTIALS", "");
    return res
      .status(401)
      .json({ error: "unauthorized", reason: "INVALID_SERVICE_CREDENTIALS" });
  }

  allowAudit(req, client.client_id, "service", "OK: token service", "");
  return res.status(200).json({
    access_token: signServiceToken(),
    token_type: "Bearer",
    expires_in: config.jwt.serviceTtlSec,
  });
});

module.exports = router;
