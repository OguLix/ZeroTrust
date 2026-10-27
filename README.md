# Sistem Nilai — Zero Trust Security

Sistem Nilai untuk program studi Informatika dengan pendekatan Zero Trust Security
(tugas praktikum Keamanan Informasi KP70065004, Informatika Universitas Siliwangi).
Dosen menginput dan memfinalisasi nilai kelas yang diampunya; setelah difinalisasi,
nilai dikirim ke Service Transkrip. Semua akses — termasuk panggilan antar-service —
diperiksa oleh API gateway.

Prinsip yang diterapkan: *never trust, always verify*, *least privilege*, dan
*assume breach*, mengikuti arsitektur NIST SP 800-207.

## Gambaran sistem dan pemetaan NIST SP 800-207

| Komponen | Port | Peran NIST | Tanggung jawab |
|---|---|---|---|
| API Gateway | 3000 | PEP | Pintu masuk tunggal; memeriksa setiap request, meminta keputusan ke Policy Engine, mencatat audit log, meneruskan ke service |
| Policy Engine / Administrator | di dalam gateway | PE / PA | Login, penerbitan dan pencabutan token, keputusan allow/deny dari kebijakan dan atribut DB |
| Service Nilai | 3001 | Resource | Data nilai dan kelas; saat finalisasi memanggil Service Transkrip lewat gateway |
| Service Transkrip | 3002 | Resource | Data transkrip |
| Database | - | Resource | Satu database SQLite bersama |
| Audit Log | - | Data source | Tabel `audit_log`, ditulis gateway |

## Role dan hak akses

| Role | Hak akses |
|---|---|
| mahasiswa | Melihat nilai dan transkrip miliknya sendiri |
| dosen | Melihat, mengubah, dan memfinalisasi nilai pada kelas yang diampunya |
| admin | Melihat transkrip seluruh mahasiswa |

## Teknologi

Node.js (CommonJS), Express, JWT (HS256), bcryptjs, better-sqlite3, dan
http-proxy-middleware — dibundel sebagai monorepo npm workspaces (`gateway`,
`service-nilai`, `service-transkrip`).

## Prasyarat

- Node.js 20 (minimum 18) dan npm.
- Sistem operasi apa pun yang didukung Node (diuji di Windows).

## Instalasi

```bash
npm install
```

Buat file `.env` dari `.env.example`, lalu isi rahasia acak:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Jalankan perintah di atas untuk `JWT_SECRET`, `GATEWAY_SECRET`, dan `SERVICE_CLIENT_SECRET`
(masing-masing nilai berbeda). Isi juga `SERVICE_CLIENT_ID` (misalnya `service-nilai`),
`JWT_ISSUER`, `BIND_HOST`, port, URL, `DB_PATH`, dan jam akses.

Inisialisasi database dan seed:

```bash
npm run db:init
npm run db:seed
```

Menjalankan seluruh sistem (gateway + dua service):

```bash
npm run dev
```

Menjalankan smoke test (sistem harus sudah berjalan):

```bash
npm run smoke
```

Skenario yang mengubah data (T16, T20, T21) bisa diulang dengan `npm run db:seed`.

## Akun seed (password pengembangan: `Password123!`)

| username | role | NIM | device ID |
|---|---|---|---|
| admin1 | admin | - | DEV-ADMIN-01 |
| dosen1 | dosen | - | DEV-DOSEN-01 |
| dosen2 | dosen | - | DEV-DOSEN-02 |
| mhs1 | mahasiswa | 2470001 | DEV-MHS-01 |
| mhs2 | mahasiswa | 2470002 | DEV-MHS-02 |
| mhs3 | mahasiswa | 2470003 | DEV-MHS-03 |

Kelas seed: `IF101` (dosen1), `IF102` (dosen2). Nilai awal: mhs1 95, mhs2 88, mhs3 70 (semua `draft`).

## Kebijakan akses

| Rute | Aturan allow | Reason deny |
|---|---|---|
| `GET /nilai` | role mahasiswa atau dosen | `ROLE_NOT_ALLOWED` |
| `PUT /nilai/:id` | role dosen; baris nilai ada; `kelas.dosen_id == sub`; status draft; jam akses | `ROLE_NOT_ALLOWED`, `RESOURCE_NOT_FOUND`, `NOT_CLASS_OWNER`, `NILAI_ALREADY_FINAL`, `OUTSIDE_ACCESS_HOURS` |
| `POST /kelas/:id/finalisasi` | role dosen; kelas ada; `kelas.dosen_id == sub`; jam akses | `ROLE_NOT_ALLOWED`, `RESOURCE_NOT_FOUND`, `NOT_CLASS_OWNER`, `OUTSIDE_ACCESS_HOURS` |
| `GET /transkrip/:nim` | role admin (semua); role mahasiswa hanya NIM miliknya | `ROLE_NOT_ALLOWED`, `NOT_OWN_NIM` |
| `POST /transkrip/sinkron` | `subject.type == service` dan `role == service` | `SERVICE_ONLY` |

Contoh curl (login dosen, lalu akses nilai):

```bash
curl -s -X POST http://127.0.0.1:3000/auth/login \
  -H 'Content-Type: application/json' -H 'X-Device-ID: DEV-DOSEN-01' \
  -d '{"username":"dosen1","password":"Password123!"}'
# simpan access_token ke TOKEN, lalu:
curl -s http://127.0.0.1:3000/nilai \
  -H "Authorization: Bearer $TOKEN" -H 'X-Device-ID: DEV-DOSEN-01'
```

Detail tiap skenario (T01-T27) ada di `docs/test-scenarios.md`.

## Mengubah jam akses (demo)

Ubah `ACCESS_HOUR_START` dan `ACCESS_HOUR_END` di `.env` (format 0-23, start < end),
lalu restart gateway. Contoh untuk demo di luar jam akses: set `ACCESS_HOUR_START=7`,
`ACCESS_HOUR_END=8` bila jam sekarang 10, sehingga PUT/finalisasi ditolak dengan
`OUTSIDE_ACCESS_HOURS`.

## Peta kebutuhan (Bagian 4 tugas) ke file/fungsi

| Kebutuhan | File / fungsi |
|---|---|
| Autentikasi dan token (login, refresh rotasi, logout, service token) | `gateway/auth.routes.js` (`/login`, `/refresh`, `/logout`, `/service`), `shared/jwt.js` (`signAccessToken`, `signServiceToken`, `verifyToken`) |
| Gateway secret (perbandingan aman) | `gateway/server.js` (strip header klien), `service-*/middleware.js` (`gatewaySecret`), `gateway/proxy.js` (`on.proxyReq`) |
| Verifikasi ulang di service | `service-*/middleware.js` (`verifyAuth`, `requireRole`), `shared/jwt.js` |
| Kebijakan berbasis atribut DB | `gateway/policy.js` (`decide`) membaca `users`, `kelas`, `nilai` |
| Device terdaftar | `gateway/server.js` (pemeriksaan `devices`), `gateway/auth.routes.js` (login) |
| Jam akses | `shared/accessHours.js` (`isWithinAccessHours`), dipakai `gateway/policy.js` |
| Audit log | `gateway/audit.js` (`writeAudit`), dipanggil `gateway/server.js` |

## Catatan keputusan keamanan dan trade-off

- **HS256 dengan rahasia bersama.** Semua komponen memakai satu `JWT_SECRET`. Alternatif RS256
  membuat service tidak bisa menerbitkan token, namun menambah kompleksitas pengelolaan kunci;
  untuk skala praktikum HS256 cukup, dengan catatan rahasia tidak boleh bocor.
- **Access token tetap valid sampai kedaluwarsa setelah logout** (maks 10 menit). Trade-off
  antara kesederhanaan dan pencabutan seketika; mitigasi lewat TTL pendek.
- **Rotasi dan deteksi pemakaian ulang refresh token.** Refresh token lama dicabut; jika token
  yang sudah dicabut dipakai lagi, semua refresh token milik user dicabut (assume breach).
- **Fail closed.** Jika penulisan audit atau pembacaan DB untuk policy gagal, request ditolak 500
  dan tidak diteruskan.
- **Default deny.** Rute yang tidak ada di tabel ditolak (`ROUTE_NOT_FOUND`) dan tetap diaudit.
- **Audit log.** Menampilkan 20 baris terakhir:

```bash
node -e "const db=require('./db/index');console.table(db.prepare('SELECT ts,subject,subject_type,method,endpoint,decision,reason FROM audit_log ORDER BY id DESC LIMIT 20').all());db.close();"
```

- **Rahasia.** `.env` dan file database tidak ikut repositori (`.gitignore`). Jangan commit
  token/password/secret.
