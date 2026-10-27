"use strict";

const config = require("../shared/config");

let cachedToken = null;
let cachedExpiry = 0;

async function getServiceToken() {
  const now = Date.now();
  if (cachedToken && now < cachedExpiry - 30000) {
    return cachedToken;
  }
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);
  try {
    const response = await fetch(config.url.gateway + "/auth/service", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        client_id: config.serviceClientId,
        client_secret: config.serviceClientSecret,
      }),
      signal: controller.signal,
    });
    clearTimeout(timeout);
    if (!response.ok) {
      throw new Error("gagal mengambil token service: " + response.status);
    }
    const data = await response.json();
    cachedToken = data.access_token;
    const ttlMs = (data.expires_in || config.jwt.serviceTtlSec) * 1000;
    cachedExpiry = Date.now() + ttlMs;
    return cachedToken;
  } catch (err) {
    clearTimeout(timeout);
    cachedToken = null;
    cachedExpiry = 0;
    throw err;
  }
}

module.exports = { getServiceToken };
