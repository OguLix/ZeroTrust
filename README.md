# Sistem Nilai — Zero Trust Security

Sistem Nilai untuk program studi Informatika dengan prinsip *never trust, always verify*,
*least privilege*, dan *assume breach* (NIST SP 800-207). Dosen menginput dan memfinalisasi
nilai kelas yang diampunya; setelah final, nilai dikirim ke Service Transkrip. Semua akses,
termasuk panggilan antar-service, diperiksa oleh API gateway.

> README ini masih kerangka; setiap bagian dilengkapi sesuai tahapan Bagian 13 AGENT.md.

## 1. Gambaran sistem dan pemetaan NIST SP 800-207

| Komponen | Port | Peran NIST |
|---|---|---|
| API Gateway | 3000 | PEP |
| Policy Engine / Administrator (di dalam gateway) | - | PE / PA |
| Service Nilai | 3001 | Resource |
| Service Transkrip | 3002 | Resource |
| Database (SQLite bersama) | - | Resource |
| Audit Log (tabel `audit_log`) | - | Data source |

## 2. Prasyarat dan cara menjalankan

- Node.js 20 (minimal 18). Unduh repositori ini ke komputer lokal.

```bash
npm install
cp .env.example .env   # isi rahasia, lihat di bawah
npm run db:init
npm run db:seed
npm run dev            # menjalankan gateway + kedua service sekaligus
npm run smoke          # skenario T01-T27
```

Membuat rahasia acak untuk `JWT_SECRET`, `GATEWAY_SECRET`, `SERVICE_CLIENT_SECRET`:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

## 3. Akun seed

Password seluruh akun pengembangan: `Password123!` (hanya untuk pengembangan).

| username | role | nama | nim | device_id |
|---|---|---|---|---|
| admin1 | admin | Admin Prodi | - | DEV-ADMIN-01 |
| dosen1 | dosen | Dosen Satu | - | DEV-DOSEN-01 |
| dosen2 | dosen | Dosen Dua | - | DEV-DOSEN-02 |
| mhs1 | mahasiswa | Mahasiswa Satu | 2470001 | DEV-MHS-01 |
| mhs2 | mahasiswa | Mahasiswa Dua | 2470002 | DEV-MHS-02 |
| mhs3 | mahasiswa | Mahasiswa Tiga | 2470003 | DEV-MHS-03 |

Data uji (T16, T20, T21) bisa diulang dengan `npm run db:seed` (seed idempotent).

## 4. Kebijakan akses dan contoh curl

TODO(Tahap 7): tabel kebijakan per endpoint + contoh curl tiap endpoint; versi lengkap
skenario curl ada di `docs/test-scenarios.md`.

## 5. Mengubah jam akses untuk demo

Jam akses dibaca saat startup gateway: jam lokal pada `ACCESS_TZ` harus memenuhi
`ACCESS_HOUR_START <= jam < ACCESS_HOUR_END`. Untuk demo, ubah `.env` lalu restart gateway.

## 6. Peta kebutuhan tugas ke file

| Kebutuhan | File / fungsi |
|---|---|
| Autentikasi dan token | `shared/jwt.js`, `gateway/auth.routes.js` |
| Gateway secret | `gateway/proxy.js`, `*/middleware.js` |
| Verifikasi ulang di service | `service-nilai/middleware.js`, `service-transkrip/middleware.js` |
| Kebijakan berbasis atribut DB | `gateway/policy.js` |
| Device terdaftar | `gateway/auth.routes.js`, pipeline gateway (`gateway/server.js`) |
| Jam akses | `shared/accessHours.js`, `gateway/policy.js` |
| Audit log | `gateway/audit.js`, tabel `audit_log` |

## 7. Catatan keputusan keamanan dan trade-off

- HS256 dengan rahasia bersama (alternatif: RS256 agar service tidak bisa menerbitkan token).
- Access token tetap berlaku sampai kedaluwarsa setelah logout (maksimal 10 menit).
- Refresh token dirotasi; pemakaian ulang refresh token yang sudah dicabut mencabut SEMUA
  token milik user tersebut (*assume breach*).
- Fail closed: kegagalan audit atau pembacaan DB untuk policy menghentikan request.
- Default deny pada rute yang tidak dikenal.
