"use strict";

const crypto = require("crypto");
const config = require("../shared/config");
const { verifyToken } = require("../shared/jwt");

function safeEqual(actual, expected) {
  const digestA = crypto.createHash("sha256").update(actual).digest();
  const digestB = crypto.createHash("sha256").update(expected).digest();
  return crypto.timingSafeEqual(digestA, digestB);
}

function gatewaySecret(req, res, next) {
  const provided = req.get("x-gateway-secret");
  if (provided === undefined || !safeEqual(provided, config.gatewaySecret)) {
    return res.status(403).json({ error: "forbidden", reason: "GATEWAY_SECRET_INVALID" });
  }
  next();
}

function verifyAuth(req, res, next) {
  const header = req.get("authorization");
  if (typeof header !== "string" || !header.startsWith("Bearer ")) {
    return res.status(401).json({ error: "unauthorized", reason: "NO_TOKEN" });
  }
  const result = verifyToken(header.slice(7).trim());
  if (!result.ok) {
    return res.status(401).json({ error: "unauthorized", reason: result.reason });
  }
  req.auth = { sub: result.payload.sub, role: result.payload.role, typ: result.payload.typ };
  next();
}

function requireRole(...roles) {
  return (req, res, next) => {
    if (!roles.includes(req.auth.role)) {
      return res.status(403).json({ error: "forbidden", reason: "ROLE_NOT_ALLOWED" });
    }
    next();
  };
}

module.exports = { gatewaySecret, verifyAuth, requireRole };
