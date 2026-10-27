"use strict";

const express = require("express");
const config = require("../shared/config");
const { verifyToken } = require("../shared/jwt");
const { writeAudit } = require("./audit");
const { matchRoute } = require("./routes");
const { decide } = require("./policy");
const { createProxy } = require("./proxy");
const authRoutes = require("./auth.routes");

const db = require("../db/index");
const deviceExists = db.prepare("SELECT 1 AS ok FROM devices WHERE user_id = ? AND device_id = ?");

const app = express();
app.disable("x-powered-by");

const proxies = new Map();
function getProxy(target) {
  if (!proxies.has(target)) {
    proxies.set(target, createProxy(target));
  }
  return proxies.get(target);
}

function targetUrl(target) {
  if (target === "service-nilai") return config.url.nilai;
  if (target === "service-transkrip") return config.url.transkrip;
  return null;
}

function errorBody(status, reason) {
  if (status === 401) return { error: "unauthorized", reason };
  if (status === 400) return { error: "bad_request", reason };
  if (status === 404) return { error: "not_found", reason };
  return { error: "forbidden", reason };
}

app.use((req, res) => {
  delete req.headers["x-gateway-secret"];
  const deviceId = req.get("x-device-id") || "";
  const endpoint = req.originalUrl;

  function writeDeny(subject, subjectType, reason, status, body) {
    writeAudit({
      subject,
      subjectType,
      method: req.method,
      endpoint,
      deviceId,
      decision: "deny",
      reason,
    });
    res.status(status).json(body);
  }

  function writeAllow(subject, subjectType, reason) {
    writeAudit({
      subject,
      subjectType,
      method: req.method,
      endpoint,
      deviceId,
      decision: "allow",
      reason,
    });
  }

  try {
    const matched = matchRoute(req.method, req.path);
    if (!matched) {
      writeDeny("", "anonymous", "ROUTE_NOT_FOUND", 404, {
        error: "not_found",
        reason: "ROUTE_NOT_FOUND",
      });
      return;
    }
    if (matched.invalid) {
      writeDeny("", "anonymous", "INVALID_PARAM", 400, {
        error: "bad_request",
        reason: "INVALID_PARAM",
      });
      return;
    }

    const route = matched.route;

    if (route.target === "gateway") {
      const savedUrl = req.url;
      req.url = req.url.replace(/^\/auth/, "") || "/";
      authRoutes(req, res, (err) => {
        req.url = savedUrl;
        if (!err) return;
        if (err.type === "entity.parse.failed") {
          writeDeny("", "anonymous", "INVALID_JSON", 400, {
            error: "bad_request",
            reason: "INVALID_JSON",
          });
          return;
        }
        if (err.type === "entity.too.large") {
          writeDeny("", "anonymous", "BODY_TOO_LARGE", 413, {
            error: "bad_request",
            reason: "BODY_TOO_LARGE",
          });
          return;
        }
        console.error("kesalahan gateway: " + (err && err.message ? err.message : err));
        if (!res.headersSent) {
          res.status(500).json({ error: "internal_error" });
        }
      });
      return;
    }

    const header = req.get("authorization");
    if (typeof header !== "string" || !header.startsWith("Bearer ")) {
      writeDeny("", "anonymous", "NO_TOKEN", 401, {
        error: "unauthorized",
        reason: "NO_TOKEN",
      });
      return;
    }
    const verified = verifyToken(header.slice(7).trim());
    if (!verified.ok) {
      writeDeny("", "anonymous", verified.reason, 401, {
        error: "unauthorized",
        reason: verified.reason,
      });
      return;
    }

    const payload = verified.payload;
    const subjectType = payload.typ === "service" ? "service" : "user";
    const subjectId = payload.sub;
    const subject = { type: subjectType, id: subjectId, role: payload.role };

    if (payload.typ === "access") {
      const dev = deviceExists.get(Number(subjectId), deviceId);
      if (!dev) {
        writeDeny(subjectId, subjectType, "DEVICE_NOT_REGISTERED", 403, {
          error: "forbidden",
          reason: "DEVICE_NOT_REGISTERED",
        });
        return;
      }
    }

    const decision = decide({
      method: req.method,
      route,
      params: matched.params,
      subject,
      now: Date.now(),
    });

    if (!decision.allow) {
      writeDeny(subjectId, subjectType, decision.reason, decision.status, errorBody(decision.status, decision.reason));
      return;
    }

    writeAllow(subjectId, subjectType, decision.reason);

    const target = targetUrl(route.target);
    const proxy = getProxy(target);
    proxy(req, res, (err) => {
      if (err) {
        console.error("kesalahan proxy: " + (err && err.message ? err.message : err));
        if (!res.headersSent) {
          res.status(502).json({ error: "bad_gateway" });
        }
      }
    });
  } catch (err) {
    console.error("kesalahan gateway: " + (err && err.message ? err.message : err));
    if (!res.headersSent) {
      res.status(500).json({ error: "internal_error" });
    }
  }
});

app.listen(config.port.gateway, config.bindHost, () => {
  console.log("gateway berjalan di " + config.bindHost + ":" + config.port.gateway);
});
