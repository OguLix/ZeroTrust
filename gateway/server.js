"use strict";

const express = require("express");
const config = require("../shared/config");
const { writeAudit } = require("./audit");
const authRoutes = require("./auth.routes");

const app = express();
app.disable("x-powered-by");

function auditContext(req) {
  return {
    subject: "",
    subjectType: "anonymous",
    method: req.method,
    endpoint: req.originalUrl,
    deviceId: req.get("x-device-id") || "",
  };
}

app.use("/auth", authRoutes);

app.use((req, res) => {
  writeAudit({ ...auditContext(req), decision: "deny", reason: "ROUTE_NOT_FOUND" });
  res.status(404).json({ error: "not_found", reason: "ROUTE_NOT_FOUND" });
});

app.use((err, req, res, next) => {
  if (res.headersSent) {
    return next(err);
  }
  if (err && err.type === "entity.parse.failed") {
    writeAudit({
      ...auditContext(req),
      decision: "deny",
      reason: "INVALID_JSON",
    });
    return res.status(400).json({ error: "bad_request", reason: "INVALID_JSON" });
  }
  if (err && err.type === "entity.too.large") {
    writeAudit({
      ...auditContext(req),
      decision: "deny",
      reason: "BODY_TOO_LARGE",
    });
    return res.status(413).json({ error: "bad_request", reason: "BODY_TOO_LARGE" });
  }
  console.error("kesalahan gateway: " + (err && err.message ? err.message : err));
  if (!res.headersSent) {
    res.status(500).json({ error: "internal_error" });
  }
});

app.listen(config.port.gateway, config.bindHost, () => {
  console.log("gateway berjalan di " + config.bindHost + ":" + config.port.gateway);
});
