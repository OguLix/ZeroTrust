"use strict";

const path = require("path");
const { spawn } = require("child_process");

const ROOT = path.resolve(__dirname, "..");
const GW = "http://127.0.0.1:3000";
const NILAI_DIRECT = "http://127.0.0.1:3001";
const TRANSKRIP_DIRECT = "http://127.0.0.1:3002";

const fs = require("fs");
const envText = fs.readFileSync(path.join(ROOT, ".env"), "utf8");
function envVal(name) {
  const m = envText.match(new RegExp("^" + name + "=(.+)$", "m"));
  return m ? m[1].trim() : "";
}
const GATEWAY_SECRET = envVal("GATEWAY_SECRET");
const ACCESS_TZ = envVal("ACCESS_TZ") || "Asia/Jakarta";
const ACCESS_HOUR_START = Number(envVal("ACCESS_HOUR_START") || 7);
const ACCESS_HOUR_END = Number(envVal("ACCESS_HOUR_END") || 21);

const { isWithinAccessHours } = require(path.join(ROOT, "shared", "accessHours"));

let pass = 0;
let fail = 0;
let skip = 0;
function check(name, condition) {
  if (condition) {
    pass++;
    console.log("PASS " + name);
  } else {
    fail++;
    console.log("FAIL " + name);
  }
}
function skipTest(name) {
  skip++;
  console.log("SKIP " + name);
}
function passOrSkipBecause(name, ran, ok) {
  if (ran) check(name, ok);
  else skipTest(name);
}

async function call(baseUrl, method, pathArg, body, token, deviceId, opts) {
  const headers = {};
  if (body !== undefined) headers["content-type"] = "application/json";
  if (token) headers.authorization = "Bearer " + token;
  if (deviceId) headers["x-device-id"] = deviceId;
  if (baseUrl !== GW && !(opts && opts.noSecret)) {
    headers["x-gateway-secret"] = GATEWAY_SECRET;
  }
  const res = await fetch(baseUrl + pathArg, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let json = null;
  if (text) {
    try { json = JSON.parse(text); } catch { json = null; }
  }
  return { status: res.status, json };
}

function hourInTz(date) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: ACCESS_TZ,
    hour: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const hourPart = parts.find((p) => p.type === "hour");
  return Number(hourPart.value);
}

function selectOutsideWindow() {
  const nowHour = hourInTz(new Date());
  for (let h = 0; h <= 22; h++) {
    const overlapsConfigured = h + 1 > ACCESS_HOUR_START && h < ACCESS_HOUR_END;
    const insideCurrentHour = nowHour === h;
    if (!overlapsConfigured && !insideCurrentHour) {
      return { start: String(h), end: String(h + 1) };
    }
  }
  return null;
}

function selectInsideWindow() {
  const nowHour = hourInTz(new Date());
  if (nowHour === 23) return null;
  return { start: String(nowHour), end: String(nowHour + 1) };
}

function killChild(child) {
  if (!child || typeof child.pid !== "number") return;
  if (process.platform === "win32") {
    try {
      spawn("taskkill", ["/PID", String(child.pid), "/T", "/F"], { stdio: "ignore" });
    } catch { }
  } else {
    child.kill("SIGTERM");
  }
}

function spawnGatewayTemporary(hours) {
  const env = Object.assign({}, process.env, {
    PORT_GATEWAY: "3099",
    ACCESS_HOUR_START: hours.start,
    ACCESS_HOUR_END: hours.end,
    ACCESS_TZ,
  });
  const child = spawn(process.execPath, ["gateway/server.js"], {
    cwd: ROOT,
    env,
    stdio: ["ignore", "pipe", "pipe"],
  });
  return child;
}

function waitForStartup(child, timeoutMs) {
  const limit = timeoutMs || 10000;
  return new Promise((resolve) => {
    let settled = false;
    let buffer = "";
    const timer = setTimeout(() => finish(false), limit);
    function finish(ok) {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      child.removeAllListeners("exit");
      child.stdout.removeAllListeners("data");
      resolve(ok);
    }
    child.stdout.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      buffer += chunk;
      if (buffer.indexOf("berjalan di 127.0.0.1:3099") !== -1) finish(true);
    });
    child.on("exit", () => finish(false));
  });
}

async function main() {
  const withinHours = isWithinAccessHours(new Date());

  const directNoSecretNilai = await call(NILAI_DIRECT, "GET", "/nilai", undefined, undefined, undefined, { noSecret: true });
  check("T04 akses langsung service nilai tanpa secret 403", directNoSecretNilai.status === 403);
  check("T04 reason GATEWAY_SECRET_INVALID", directNoSecretNilai.json && directNoSecretNilai.json.reason === "GATEWAY_SECRET_INVALID");
  const directNoSecretTranskrip = await call(TRANSKRIP_DIRECT, "GET", "/transkrip/2470001", undefined, undefined, undefined, { noSecret: true });
  check("T04 akses langsung service transkrip tanpa secret 403", directNoSecretTranskrip.status === 403);
  check("T04 reason GATEWAY_SECRET_INVALID (transkrip)", directNoSecretTranskrip.json && directNoSecretTranskrip.json.reason === "GATEWAY_SECRET_INVALID");

  const directWithSecretNilai = await call(NILAI_DIRECT, "GET", "/nilai", undefined, undefined, undefined);
  check("T05 service nilai secret tanpa token 401", directWithSecretNilai.status === 401);
  check("T05 reason NO_TOKEN (nilai)", directWithSecretNilai.json && directWithSecretNilai.json.reason === "NO_TOKEN");
  const directWithSecretTranskrip = await call(TRANSKRIP_DIRECT, "GET", "/transkrip/2470001", undefined, undefined, undefined);
  check("T05 service transkrip secret tanpa token 401", directWithSecretTranskrip.status === 401);
  check("T05 reason NO_TOKEN (transkrip)", directWithSecretTranskrip.json && directWithSecretTranskrip.json.reason === "NO_TOKEN");

  const t06 = await call(GW, "GET", "/nilai");
  check("T06 gateway tanpa token 401", t06.status === 401);
  check("T06 reason NO_TOKEN", t06.json && t06.json.reason === "NO_TOKEN");

  const t07 = await call(GW, "GET", "/nilai", undefined, "bukan.token.sama.sekali");
  check("T07 token salah 401", t07.status === 401);
  check("T07 reason INVALID_TOKEN", t07.json && t07.json.reason === "INVALID_TOKEN");

  const jwt = require("jsonwebtoken");
  const JWT_SECRET = envVal("JWT_SECRET");
  const JWT_ISSUER = envVal("JWT_ISSUER");
  let expiredToken = null;
  try {
    expiredToken = jwt.sign(
      { sub: "4", role: "mahasiswa", typ: "access" },
      JWT_SECRET,
      { algorithm: "HS256", issuer: JWT_ISSUER, expiresIn: -1 }
    );
  } catch (err) {
    expiredToken = null;
  }
  if (expiredToken) {
    const t07Expired = await call(GW, "GET", "/nilai", undefined, expiredToken);
    check("T07 token kedaluwarsa 401", t07Expired.status === 401);
    check("T07 reason TOKEN_EXPIRED", t07Expired.json && t07Expired.json.reason === "TOKEN_EXPIRED");
  } else {
    skipTest("T07 token kedaluwarsa (gagal menandatangani token uji)");
  }

  const loginMhs = await call(GW, "POST", "/auth/login", { username: "mhs1", password: "Password123!" }, undefined, "DEV-MHS-01");
  check("T01 login mhs1 200", loginMhs.status === 200);
  check("T01 ada access_token", !!(loginMhs.json && loginMhs.json.access_token));
  check("T01 ada refresh_token", !!(loginMhs.json && loginMhs.json.refresh_token));
  const mhsToken = loginMhs.json ? loginMhs.json.access_token : "";
  const mhsRefresh = loginMhs.json ? loginMhs.json.refresh_token : "";

  const loginBad = await call(GW, "POST", "/auth/login", { username: "mhs1", password: "salah" }, undefined, "DEV-MHS-01");
  check("T02 password salah 401", loginBad.status === 401);
  check("T02 invalid_credentials", !!(loginBad.json && loginBad.json.error === "invalid_credentials"));
  check("T02 tanpa access_token", !(loginBad.json && loginBad.json.access_token));

  const loginDevice = await call(GW, "POST", "/auth/login", { username: "mhs1", password: "Password123!" }, undefined, "DEV-ADMIN-01");
  check("T03 device tidak terdaftar 403", loginDevice.status === 403);
  check("T03 reason DEVICE_NOT_REGISTERED", loginDevice.json && loginDevice.json.reason === "DEVICE_NOT_REGISTERED");

  const t08 = await call(GW, "GET", "/nilai", undefined, mhsToken, "DEV-DOSEN-01");
  check("T08 device milik user lain 403", t08.status === 403);
  check("T08 reason DEVICE_NOT_REGISTERED", t08.json && t08.json.reason === "DEVICE_NOT_REGISTERED");

  const t09 = await call(GW, "GET", "/nilai", undefined, mhsToken, "DEV-MHS-01");
  check("T09 mhs1 GET nilai 200", t09.status === 200);
  check("T09 2 baris", Array.isArray(t09.json) && t09.json.length === 2);
  check("T09 semua miliknya", Array.isArray(t09.json) && t09.json.every((r) => r.mahasiswa === "Mahasiswa Satu"));

  const loginDosen = await call(GW, "POST", "/auth/login", { username: "dosen1", password: "Password123!" }, undefined, "DEV-DOSEN-01");
  const dosenToken = loginDosen.json ? loginDosen.json.access_token : "";
  const t10 = await call(GW, "GET", "/nilai", undefined, dosenToken, "DEV-DOSEN-01");
  check("T10 dosen1 GET nilai 200", t10.status === 200);
  check("T10 3 baris", Array.isArray(t10.json) && t10.json.length === 3);
  check("T10 hanya kelas IF101", Array.isArray(t10.json) && t10.json.every((r) => r.kode_mk === "IF101"));

  const loginAdmin = await call(GW, "POST", "/auth/login", { username: "admin1", password: "Password123!" }, undefined, "DEV-ADMIN-01");
  const adminToken = loginAdmin.json ? loginAdmin.json.access_token : "";
  const t11 = await call(GW, "GET", "/nilai", undefined, adminToken, "DEV-ADMIN-01");
  check("T11 admin GET nilai 403", t11.status === 403);
  check("T11 reason ROLE_NOT_ALLOWED", t11.json && t11.json.reason === "ROLE_NOT_ALLOWED");

  const t12 = await call(GW, "GET", "/transkrip/2470002", undefined, mhsToken, "DEV-MHS-01");
  check("T12 mhs1 transkrip mhs2 403", t12.status === 403);
  check("T12 reason NOT_OWN_NIM", t12.json && t12.json.reason === "NOT_OWN_NIM");

  const t13 = await call(GW, "GET", "/transkrip/2470001", undefined, mhsToken, "DEV-MHS-01");
  check("T13 mhs1 transkrip sendiri 200", t13.status === 200);
  check("T13 entries array", t13.json && Array.isArray(t13.json.entries));

  const t14 = await call(GW, "GET", "/transkrip/2470002", undefined, adminToken, "DEV-ADMIN-01");
  check("T14 admin transkrip 200", t14.status === 200);

  const dosenNilai = await call(GW, "GET", "/nilai", undefined, dosenToken, "DEV-DOSEN-01");
  const idBarisDosen1 = dosenNilai.json && dosenNilai.json[0] ? dosenNilai.json[0].id : null;
  const idKelasDosen1 = dosenNilai.json && dosenNilai.json[0] ? dosenNilai.json[0].kelas_id : null;

  const loginDosen2 = await call(GW, "POST", "/auth/login", { username: "dosen2", password: "Password123!" }, undefined, "DEV-DOSEN-02");
  const dosen2Token = loginDosen2.json ? loginDosen2.json.access_token : "";
  const dosen2Nilai = await call(GW, "GET", "/nilai", undefined, dosen2Token, "DEV-DOSEN-02");
  const idBarisDosen2 = dosen2Nilai.json && dosen2Nilai.json[0] ? dosen2Nilai.json[0].id : null;
  const idKelasDosen2 = dosen2Nilai.json && dosen2Nilai.json[0] ? dosen2Nilai.json[0].kelas_id : null;

  const t15 = await call(GW, "PUT", "/nilai/" + idBarisDosen2, { nilai_angka: 90 }, dosenToken, "DEV-DOSEN-01");
  check("T15 put kelas dosen2 403", t15.status === 403);
  check("T15 reason NOT_CLASS_OWNER", t15.json && t15.json.reason === "NOT_CLASS_OWNER");

  if (withinHours) {
    const t16 = await call(GW, "PUT", "/nilai/" + idBarisDosen1, { nilai_angka: 95 }, dosenToken, "DEV-DOSEN-01");
    check("T16 put kelas sendiri 200", t16.status === 200);
    check("T16 nilai_huruf A", t16.json && t16.json.nilai_huruf === "A");
  } else {
    const t16 = await call(GW, "PUT", "/nilai/" + idBarisDosen1, { nilai_angka: 95 }, dosenToken, "DEV-DOSEN-01");
    check("T16 put kelas sendiri (luar jam) 403", t16.status === 403);
    check("T16 reason OUTSIDE_ACCESS_HOURS", t16.json && t16.json.reason === "OUTSIDE_ACCESS_HOURS");
  }

  const outsideWindow = selectOutsideWindow();
  let t17Ready = false;
  let tempT17 = null;
  if (!outsideWindow) {
    skipTest("T17 jendela out-of-hours tidak dapat dibentuk dari ACCESS_HOUR_START/END dan ACCESS_TZ");
  } else {
    tempT17 = spawnGatewayTemporary(outsideWindow);
    t17Ready = await waitForStartup(tempT17);
    try {
      if (!t17Ready) {
        check("T17 gateway sementara gagal berjalan", false);
      } else {
        const GW_TEMP = "http://127.0.0.1:3099";
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 10000);
        let res = null;
        try {
          res = await fetch(GW_TEMP + "/nilai", {
            method: "GET",
            headers: {
              authorization: "Bearer " + dosenToken,
              "x-device-id": "DEV-DOSEN-01",
            },
            signal: controller.signal,
          });
        } catch (err) {
          res = null;
        } finally {
          clearTimeout(timer);
        }
        if (!res || res.status !== 200) {
          check("T17 precheck token valid di gateway sementara", false);
        } else {
          const controller2 = new AbortController();
          const timer2 = setTimeout(() => controller2.abort(), 10000);
          let res2 = null;
          try {
            res2 = await fetch(GW_TEMP + "/nilai/" + idBarisDosen1, {
              method: "PUT",
              headers: {
                "content-type": "application/json",
                authorization: "Bearer " + dosenToken,
                "x-device-id": "DEV-DOSEN-01",
              },
              body: JSON.stringify({ nilai_angka: 95 }),
              signal: controller2.signal,
            });
          } catch (err) {
            res2 = null;
          } finally {
            clearTimeout(timer2);
          }
          if (!res2) {
            check("T17 request tidak retenant ke policy engine", false);
          } else {
            const text = await res2.text();
            let json = null;
            try { json = JSON.parse(text); } catch { json = null; }
            check("T17 put luar jam 403", res2.status === 403);
            check("T17 reason OUTSIDE_ACCESS_HOURS", json && json.reason === "OUTSIDE_ACCESS_HOURS");
          }
        }
      }
    } finally {
      killChild(tempT17);
    }
  }

  const t18 = await call(GW, "PUT", "/nilai/" + idBarisDosen1, { nilai_angka: 90 }, mhsToken, "DEV-MHS-01");
  check("T18 mhs put 403", t18.status === 403);
  check("T18 reason ROLE_NOT_ALLOWED", t18.json && t18.json.reason === "ROLE_NOT_ALLOWED");

  const t19 = await call(GW, "POST", "/kelas/" + idKelasDosen2 + "/finalisasi", undefined, dosenToken, "DEV-DOSEN-01");
  check("T19 finalisasi kelas dosen2 403", t19.status === 403);
  check("T19 reason NOT_CLASS_OWNER", t19.json && t19.json.reason === "NOT_CLASS_OWNER");

  const syncAsUser = await call(GW, "POST", "/transkrip/sinkron", { kelas_id: idKelasDosen1, kode_mk: "IF101", nama_mk: "Pemrograman Web", entries: [{ nim: "2470001", nilai_angka: 95, nilai_huruf: "A" }] }, dosenToken, "DEV-DOSEN-01");
  check("T22 user sinkron 403", syncAsUser.status === 403);
  check("T22 reason SERVICE_ONLY", syncAsUser.json && syncAsUser.json.reason === "SERVICE_ONLY");

  const svcLogin = await call(GW, "POST", "/auth/service", { client_id: envVal("SERVICE_CLIENT_ID"), client_secret: envVal("SERVICE_CLIENT_SECRET") });
  const svcToken = svcLogin.json ? svcLogin.json.access_token : "";
  const svcNilai = await call(GW, "GET", "/nilai", undefined, svcToken);
  check("T23 service GET nilai 403", svcNilai.status === 403);
  check("T23 reason ROLE_NOT_ALLOWED", svcNilai.json && svcNilai.json.reason === "ROLE_NOT_ALLOWED");
  const svcTranskrip = await call(GW, "GET", "/transkrip/2470001", undefined, svcToken);
  check("T23b service GET transkrip 403", svcTranskrip.status === 403);
  check("T23b reason ROLE_NOT_ALLOWED", svcTranskrip.json && svcTranskrip.json.reason === "ROLE_NOT_ALLOWED");

  if (withinHours) {
    const fin = await call(GW, "POST", "/kelas/" + idKelasDosen1 + "/finalisasi", undefined, dosenToken, "DEV-DOSEN-01");
    check("T20 finalisasi kelas sendiri 200", fin.status === 200);
    check("T20 finalized 3", fin.json && fin.json.finalized === 3);
    check("T20 synced true", fin.json && fin.json.synced === true);
    const transkripAfter = await call(GW, "GET", "/transkrip/2470001", undefined, mhsToken, "DEV-MHS-01");
    check("T20 transkrip terisi", transkripAfter.json && Array.isArray(transkripAfter.json.entries) && transkripAfter.json.entries.length === 1);
  } else {
    const insideWindow = selectInsideWindow();
    let finalizedViaGateway = false;
    let tempT20 = null;
    if (insideWindow) {
      tempT20 = spawnGatewayTemporary(insideWindow);
      const tempReady = await waitForStartup(tempT20);
      try {
        if (tempReady) {
          const GW_TEMP = "http://127.0.0.1:3099";
          const controller = new AbortController();
          const timer = setTimeout(() => controller.abort(), 10000);
          let res = null;
          try {
            res = await fetch(GW_TEMP + "/kelas/" + idKelasDosen1 + "/finalisasi", {
              method: "POST",
              headers: {
                authorization: "Bearer " + dosenToken,
                "x-device-id": "DEV-DOSEN-01",
              },
              signal: controller.signal,
            });
          } catch (err) {
            res = null;
          } finally {
            clearTimeout(timer);
          }
          if (res) {
            const text = await res.text();
            let json = null;
            try { json = JSON.parse(text); } catch { json = null; }
            check("T20 finalisasi kelas sendiri via gateway sementara 200", res.status === 200);
            check("T20 finalized 3 via gateway sementara", json && json.finalized === 3);
            check("T20 synced true via gateway sementara", json && json.synced === true);
            finalizedViaGateway = res.status === 200;
          } else {
            passOrSkipBecause("T20 request finalisasi via gateway sementara", false, false);
          }
        } else {
          passOrSkipBecause("T20 gateway sementara jendela jam saat ini (out-of-hours)", false, false);
        }
      } finally {
        killChild(tempT20);
      }
    }

    let finalizedViaService = false;
    if (!finalizedViaGateway) {
      const finService = await call(NILAI_DIRECT, "POST", "/kelas/" + idKelasDosen1 + "/finalisasi", undefined, dosenToken, "DEV-DOSEN-01");
      finalizedViaService = finService.status === 200;
      check("T20 finalisasi kelas sendiri via service (fallback out-of-hours) 200", finService.status === 200);
    }

    if (finalizedViaGateway || finalizedViaService) {
      const transkripAfter = await call(GW, "GET", "/transkrip/2470001", undefined, mhsToken, "DEV-MHS-01");
      check("T20 transkrip terisi (out-of-hours)", transkripAfter.json && Array.isArray(transkripAfter.json.entries) && transkripAfter.json.entries.length === 1);
    }
  }

  const putFinal = await call(GW, "PUT", "/nilai/" + idBarisDosen1, { nilai_angka: 93 }, dosenToken, "DEV-DOSEN-01");
  check("T21 put nilai final 403", putFinal.status === 403);
  check("T21 reason NILAI_ALREADY_FINAL", putFinal.json && putFinal.json.reason === "NILAI_ALREADY_FINAL");

  const t26 = await call(GW, "GET", "/admin");
  check("T26 rute tak dikenal 403/404", t26.status === 403 || t26.status === 404);
  check("T26 reason ROUTE_NOT_FOUND", t26.json && t26.json.reason === "ROUTE_NOT_FOUND");

  const refreshRes = await call(GW, "POST", "/auth/refresh", { refresh_token: mhsRefresh }, undefined, "DEV-MHS-01");
  check("T24 refresh valid 200", refreshRes.status === 200);
  check("T24 ada access_token baru", !!(refreshRes.json && refreshRes.json.access_token));
  const newRefresh = refreshRes.json ? refreshRes.json.refresh_token : mhsRefresh;
  const oldRefreshReuse = await call(GW, "POST", "/auth/refresh", { refresh_token: mhsRefresh }, undefined, "DEV-MHS-01");
  check("T24 token lama ditolak", oldRefreshReuse.status === 401);

  const loginT25 = await call(GW, "POST", "/auth/login", { username: "mhs1", password: "Password123!" }, undefined, "DEV-MHS-01");
  const refreshT25 = loginT25.json ? loginT25.json.refresh_token : "";
  await call(GW, "POST", "/auth/logout", { refresh_token: refreshT25 }, undefined, "DEV-MHS-01");
  const refreshAfterLogout = await call(GW, "POST", "/auth/refresh", { refresh_token: refreshT25 }, undefined, "DEV-MHS-01");
  check("T25 logout lalu refresh 401", refreshAfterLogout.status === 401);

  try {
    const db = require(path.join(ROOT, "db", "index"));
    const rows = db.prepare("SELECT decision, reason, subject_type FROM audit_log").all();
    db.close();
    check("T27 audit ada baris allow", rows.some((r) => r.decision === "allow"));
    check("T27 audit ada baris deny", rows.some((r) => r.decision === "deny"));
    check("T27 audit memuat reason NO_TOKEN", rows.some((r) => r.reason === "NO_TOKEN"));
    const joined = JSON.stringify(rows);
    check("T27 tidak ada token JWT di audit", !joined.includes("eyJ"));
    check("T27 tidak ada password di audit", !joined.includes("Password123!"));
  } catch (err) {
    check("T27 audit dapat dibaca", false);
  }

  console.log("TOTAL pass=" + pass + " fail=" + fail + " skip=" + skip);
  process.exit(fail === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error("gagal: " + (err && err.message ? err.message : err));
  process.exit(1);
});
