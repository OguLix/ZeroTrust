"use strict";

const express = require("express");
const config = require("../shared/config");
const { gatewaySecret } = require("./middleware");
const routes = require("./routes");

const app = express();
app.disable("x-powered-by");

app.use(express.json({ limit: "10kb" }));
app.use(gatewaySecret);
app.use(routes);

app.use((req, res) => {
  res.status(404).json({ error: "not_found", reason: "ROUTE_NOT_FOUND" });
});

app.use((err, req, res, next) => {
  if (res.headersSent) {
    return next(err);
  }
  if (err && err.type === "entity.parse.failed") {
    return res.status(400).json({ error: "bad_request", reason: "INVALID_JSON" });
  }
  if (err && err.type === "entity.too.large") {
    return res.status(413).json({ error: "bad_request", reason: "BODY_TOO_LARGE" });
  }
  console.error("kesalahan service transkrip: " + (err && err.message ? err.message : err));
  if (!res.headersSent) {
    res.status(500).json({ error: "internal_error" });
  }
});

app.listen(config.port.transkrip, config.bindHost, () => {
  console.log("service transkrip berjalan di " + config.bindHost + ":" + config.port.transkrip);
});
