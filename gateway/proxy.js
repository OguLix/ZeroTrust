"use strict";

const { createProxyMiddleware, fixRequestBody } = require("http-proxy-middleware");
const config = require("../shared/config");

function createProxy(target) {
  return createProxyMiddleware({
    target,
    changeOrigin: true,
    on: {
      proxyReq: (proxyReq, req) => {
        proxyReq.setHeader("X-Gateway-Secret", config.gatewaySecret);
        proxyReq.removeHeader("cookie");
        fixRequestBody(proxyReq, req);
      },
    },
  });
}

module.exports = { createProxy };
