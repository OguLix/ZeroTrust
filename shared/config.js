"use strict";

const path = require("path");
const dotenv = require("dotenv");

const ROOT_DIR = path.resolve(__dirname, "..");
dotenv.config({ path: path.join(ROOT_DIR, ".env") });

const PLACEHOLDERS = new Set(["ganti-dengan-hex-acak"]);

function fail(message) {
  process.stderr.write("config gagal: " + message + "\n");
  process.exit(1);
}

function readString(name) {
  const raw = process.env[name];
  if (raw === undefined || raw.trim() === "" || PLACEHOLDERS.has(raw.trim())) {
    fail("variabel " + name + " wajib terisi di .env dan tidak boleh placeholder");
  }
  return raw.trim();
}

function readInt(name, min, max) {
  const raw = readString(name);
  const value = Number(raw);
  if (!Number.isInteger(value) || value < min || value > max) {
    fail("variabel " + name + " harus bilangan bulat " + min + ".." + max + ", dapat: " + raw);
  }
  return value;
}

function readPort(name) {
  return readInt(name, 1, 65535);
}

function readUrl(name) {
  const raw = readString(name);
  let parsed;
  try {
    parsed = new URL(raw);
  } catch {
    fail("variabel " + name + " harus URL yang valid, dapat: " + raw);
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    fail("variabel " + name + " harus dimulai http:// atau https://");
  }
  return raw;
}

function readTimezone(name) {
  const raw = readString(name);
  try {
    new Intl.DateTimeFormat("id-ID", { timeZone: raw });
  } catch {
    fail("variabel " + name + " harus nama zona waktu IANA yang valid, dapat: " + raw);
  }
  return raw;
}

function readDbPath(name) {
  return path.resolve(ROOT_DIR, readString(name));
}

const startHour = readInt("ACCESS_HOUR_START", 0, 23);
const endHour = readInt("ACCESS_HOUR_END", 0, 23);
if (startHour >= endHour) {
  fail("ACCESS_HOUR_START harus lebih kecil dari ACCESS_HOUR_END");
}

const config = {
  rootDir: ROOT_DIR,
  bindHost: readString("BIND_HOST"),
  port: {
    gateway: readPort("PORT_GATEWAY"),
    nilai: readPort("PORT_NILAI"),
    transkrip: readPort("PORT_TRANSKRIP"),
  },
  jwt: {
    secret: readString("JWT_SECRET"),
    issuer: readString("JWT_ISSUER"),
    accessTtlSec: readInt("ACCESS_TOKEN_TTL_SEC", 1, 86400),
    refreshTtlSec: readInt("REFRESH_TOKEN_TTL_SEC", 1, 2592000),
    serviceTtlSec: readInt("SERVICE_TOKEN_TTL_SEC", 1, 86400),
  },
  gatewaySecret: readString("GATEWAY_SECRET"),
  serviceClientId: readString("SERVICE_CLIENT_ID"),
  serviceClientSecret: readString("SERVICE_CLIENT_SECRET"),
  url: {
    gateway: readUrl("GATEWAY_URL"),
    nilai: readUrl("NILAI_URL"),
    transkrip: readUrl("TRANSKRIP_URL"),
  },
  dbPath: readDbPath("DB_PATH"),
  accessHours: {
    start: startHour,
    end: endHour,
    tz: readTimezone("ACCESS_TZ"),
  },
};

module.exports = config;
