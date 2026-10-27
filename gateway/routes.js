"use strict";

const ROUTES = [
  { method: "POST", path: "/auth/login", target: "gateway", mode: "public" },
  { method: "POST", path: "/auth/refresh", target: "gateway", mode: "public" },
  { method: "POST", path: "/auth/logout", target: "gateway", mode: "public" },
  { method: "POST", path: "/auth/service", target: "gateway", mode: "public" },
  { method: "GET", path: "/nilai", target: "service-nilai", mode: "user" },
  { method: "PUT", path: "/nilai/:id", target: "service-nilai", mode: "user", params: { id: "int" } },
  { method: "POST", path: "/kelas/:id/finalisasi", target: "service-nilai", mode: "user", params: { id: "int" } },
  { method: "GET", path: "/transkrip/:nim", target: "service-transkrip", mode: "user", params: { nim: "nim" } },
  { method: "POST", path: "/transkrip/sinkron", target: "service-transkrip", mode: "service" },
];

function compile(route) {
  const keys = [];
  const regexSource = route.path.replace(/:([a-zA-Z_]+)/g, (_, key) => {
    keys.push(key);
    return "([^/]+)";
  });
  return Object.assign({}, route, {
    keys,
    regex: new RegExp("^" + regexSource.replace(/\//g, "\\/") + "$"),
  });
}

const COMPILED = ROUTES.map(compile);

function validateParam(type, value) {
  if (type === "int") {
    if (!/^[0-9]+$/.test(value)) return false;
    const n = Number(value);
    return Number.isInteger(n) && n >= 1;
  }
  if (type === "nim") {
    return /^[0-9]{5,15}$/.test(value);
  }
  return true;
}

function matchRoute(method, pathname) {
  for (const route of COMPILED) {
    if (route.method !== method) continue;
    const match = route.regex.exec(pathname);
    if (!match) continue;
    const params = {};
    route.keys.forEach((key, index) => {
      params[key] = match[index + 1];
    });
    if (route.params) {
      for (const [key, type] of Object.entries(route.params)) {
        if (!validateParam(type, params[key])) {
          return { route, params, invalid: true };
        }
        if (type === "int") {
          params[key] = Number(params[key]);
        }
      }
    }
    return { route, params, invalid: false };
  }
  return null;
}

module.exports = { ROUTES, matchRoute };
