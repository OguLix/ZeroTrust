"use strict";

const jwt = require("jsonwebtoken");
const config = require("./config");

function signAccessToken(sub, role) {
  return jwt.sign(
    { sub: String(sub), role, typ: "access" },
    config.jwt.secret,
    {
      algorithm: "HS256",
      issuer: config.jwt.issuer,
      expiresIn: config.jwt.accessTtlSec,
    }
  );
}

function signServiceToken() {
  return jwt.sign(
    { sub: config.serviceClientId, role: "service", typ: "service" },
    config.jwt.secret,
    {
      algorithm: "HS256",
      issuer: config.jwt.issuer,
      expiresIn: config.jwt.serviceTtlSec,
    }
  );
}

function verifyToken(token) {
  let payload;
  try {
    payload = jwt.verify(token, config.jwt.secret, {
      algorithms: ["HS256"],
      issuer: config.jwt.issuer,
      clockTolerance: 0,
    });
  } catch (err) {
    const reason = err && err.name === "TokenExpiredError" ? "TOKEN_EXPIRED" : "INVALID_TOKEN";
    return { ok: false, reason };
  }
  if (typeof payload !== "object" || payload === null) {
    return { ok: false, reason: "INVALID_TOKEN" };
  }
  if (payload.typ !== "access" && payload.typ !== "service") {
    return { ok: false, reason: "INVALID_TOKEN" };
  }
  if (typeof payload.sub !== "string" || payload.sub === "") {
    return { ok: false, reason: "INVALID_TOKEN" };
  }
  if (typeof payload.role !== "string" || payload.role === "") {
    return { ok: false, reason: "INVALID_TOKEN" };
  }
  return { ok: true, payload };
}

module.exports = { signAccessToken, signServiceToken, verifyToken };
