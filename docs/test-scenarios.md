# Skenario Uji (versi curl) — untuk demo

Versi curl dari skenario T01-T27 untuk video demo. Script
otomatisnya ada di `scripts/smoke-test.js` (`npm run smoke`).

Sistem harus sudah berjalan (`npm run dev`) dengan data seed (`npm run db:init` lalu
`npm run db:seed`). Skenario pengubah data (T16, T20, T21) bisa direset dengan
`npm run db:seed`.

Rujukan keluarannya: tampilkan audit log dengan query 20 baris terakhir (README).

## Daftar skenario

| ID | Skenario ringkas | Hasil yang diharapkan |
|---|---|---|
| T01 | Login mhs1 benar dengan device DEV-MHS-01 | 200, access + refresh token |
| T02 | Login password salah | 401 invalid_credentials |
| T03 | Login benar, device tidak terdaftar | 403 DEVICE_NOT_REGISTERED |
| T04 | Akses langsung :3001 / :3002 tanpa secret | 403 |
| T05 | Langsung ke service dengan secret, tanpa token | 401 |
| T06 | Gateway tanpa token | 401 NO_TOKEN |
| T07 | Token kedaluwarsa / tanda tangan salah | 401 |
| T08 | X-Device-ID milik user lain | 403 DEVICE_NOT_REGISTERED |
| T09 | mhs1 GET /nilai | 200, hanya miliknya |
| T10 | dosen1 GET /nilai | 200, hanya kelas IF101 |
| T11 | admin1 GET /nilai | 403 ROLE_NOT_ALLOWED |
| T12 | mhs1 GET /transkrip/2470002 | 403 NOT_OWN_NIM |
| T13 | mhs1 GET /transkrip/2470001 | 200 |
| T14 | admin1 GET /transkrip/2470002 | 200 |
| T15 | dosen1 PUT /nilai/:id kelas dosen2 | 403 NOT_CLASS_OWNER |
| T16 | dosen1 PUT /nilai/:id kelasnya, dalam jam | 200 |
| T17 | Sama T16 di luar jam akses | 403 OUTSIDE_ACCESS_HOURS |
| T18 | mhs1 PUT /nilai/:id | 403 ROLE_NOT_ALLOWED |
| T19 | dosen1 finalisasi kelas dosen2 | 403 NOT_CLASS_OWNER |
| T20 | dosen1 finalisasi kelasnya, dalam jam | 200; nilai final, transkrip terisi |
| T21 | PUT pada nilai yang sudah final | 403 NILAI_ALREADY_FINAL |
| T22 | Token user ke POST /transkrip/sinkron | 403 SERVICE_ONLY |
| T23 | Token service ke GET /nilai atau GET /transkrip/:nim | 403 ROLE_NOT_ALLOWED |
| T24 | Refresh valid | 200 token baru; token lama ditolak |
| T25 | Logout lalu refresh | 401 |
| T26 | Rute tak dikenal (GET /admin) | 403/404 ROUTE_NOT_FOUND, tetap diaudit |
| T27 | Audit log akhir | baris allow + deny dengan alasan, tanpa token/password |

## Perintah curl

Siapkan variabel (sesuaikan port bila perlu):

```bash
export GATEWAY=http://127.0.0.1:3000
export SECRET=$(grep '^GATEWAY_SECRET=' .env | cut -d= -f2-)
```

Token yang didapat dari login disimpan ke variabel `TOKEN` (access) dan `REFRESH` (refresh), misalnya
dengan `jq` atau dengan menyalin manual dari respons.

### T01 — Login mhs1 benar

```bash
curl -s -X POST $GATEWAY/auth/login \
  -H 'Content-Type: application/json' -H 'X-Device-ID: DEV-MHS-01' \
  -d '{"username":"mhs1","password":"Password123!"}'
```

### T02 — Login password salah

```bash
curl -s -o /dev/null -w '%{http_code}\n' -X POST $GATEWAY/auth/login \
  -H 'Content-Type: application/json' -H 'X-Device-ID: DEV-MHS-01' \
  -d '{"username":"mhs1","password":"salah"}'
```

### T03 — Login device tidak terdaftar

```bash
curl -s -X POST $GATEWAY/auth/login \
  -H 'Content-Type: application/json' -H 'X-Device-ID: DEV-ADMIN-01' \
  -d '{"username":"mhs1","password":"Password123!"}'
```

### T04 — Akses langsung tanpa secret

```bash
curl -s -o /dev/null -w '%{http_code}\n' http://127.0.0.1:3001/nilai
curl -s -o /dev/null -w '%{http_code}\n' http://127.0.0.1:3002/transkrip/2470001
```

### T05 — Akses langsung dengan secret tanpa token

```bash
curl -s -o /dev/null -w '%{http_code}\n' http://127.0.0.1:3001/nilai \
  -H "X-Gateway-Secret: $SECRET"
```

### T06 — Gateway tanpa token

```bash
curl -s $GATEWAY/nilai
```

### T07 — Token salah

```bash
curl -s $GATEWAY/nilai -H 'Authorization: Bearer bukan.token.sama.sekali'
```

### T08 — X-Device-ID milik user lain

```bash
curl -s $GATEWAY/nilai -H "Authorization: Bearer $TOKEN" -H 'X-Device-ID: DEV-DOSEN-01'
```

### T09 — mhs1 GET /nilai

```bash
curl -s $GATEWAY/nilai -H "Authorization: Bearer $TOKEN" -H 'X-Device-ID: DEV-MHS-01'
```

### T10 — dosen1 GET /nilai

```bash
curl -s $GATEWAY/nilai -H "Authorization: Bearer $TOKEN_DOSEN" -H 'X-Device-ID: DEV-DOSEN-01'
```

### T11 — admin1 GET /nilai

```bash
curl -s $GATEWAY/nilai -H "Authorization: Bearer $TOKEN_ADMIN" -H 'X-Device-ID: DEV-ADMIN-01'
```

### T12 — mhs1 GET /transkrip/2470002

```bash
curl -s $GATEWAY/transkrip/2470002 -H "Authorization: Bearer $TOKEN" -H 'X-Device-ID: DEV-MHS-01'
```

### T13 — mhs1 GET /transkrip/2470001

```bash
curl -s $GATEWAY/transkrip/2470001 -H "Authorization: Bearer $TOKEN" -H 'X-Device-ID: DEV-MHS-01'
```

### T14 — admin1 GET /transkrip/2470002

```bash
curl -s $GATEWAY/transkrip/2470002 -H "Authorization: Bearer $TOKEN_ADMIN" -H 'X-Device-ID: DEV-ADMIN-01'
```

### T15 — dosen1 PUT nilai kelas dosen2

```bash
curl -s -X PUT $GATEWAY/nilai/<ID_BARIS_DOSEN2> \
  -H "Authorization: Bearer $TOKEN_DOSEN" -H 'X-Device-ID: DEV-DOSEN-01' \
  -H 'Content-Type: application/json' -d '{"nilai_angka":90}'
```

### T16 — dosen1 PUT nilai kelasnya (dalam jam akses)

```bash
curl -s -X PUT $GATEWAY/nilai/<ID_BARIS_DOSEN1> \
  -H "Authorization: Bearer $TOKEN_DOSEN" -H 'X-Device-ID: DEV-DOSEN-01' \
  -H 'Content-Type: application/json' -d '{"nilai_angka":95}'
```

### T17 — sama T16 di luar jam akses

Jalankan perintah T16 pada jam di luar 07:00-21:00 (ACCESS_HOUR_START..END); hasil yang
diharapkan `403 OUTSIDE_ACCESS_HOURS`.

### T18 — mhs1 PUT /nilai/:id

```bash
curl -s -X PUT $GATEWAY/nilai/<ID_BARIS_DOSEN1> \
  -H "Authorization: Bearer $TOKEN" -H 'X-Device-ID: DEV-MHS-01' \
  -H 'Content-Type: application/json' -d '{"nilai_angka":90}'
```

### T19 — dosen1 finalisasi kelas dosen2

```bash
curl -s -X POST $GATEWAY/kelas/<ID_KELAS_DOSEN2>/finalisasi \
  -H "Authorization: Bearer $TOKEN_DOSEN" -H 'X-Device-ID: DEV-DOSEN-01'
```

### T20 — dosen1 finalisasi kelasnya (dalam jam akses)

```bash
curl -s -X POST $GATEWAY/kelas/<ID_KELAS_DOSEN1>/finalisasi \
  -H "Authorization: Bearer $TOKEN_DOSEN" -H 'X-Device-ID: DEV-DOSEN-01'
```

### T21 — PUT pada nilai yang sudah final

```bash
curl -s -X PUT $GATEWAY/nilai/<ID_BARIS_DOSEN1> \
  -H "Authorization: Bearer $TOKEN_DOSEN" -H 'X-Device-ID: DEV-DOSEN-01' \
  -H 'Content-Type: application/json' -d '{"nilai_angka":93}'
```

### T22 — Token user ke POST /transkrip/sinkron

```bash
curl -s -X POST $GATEWAY/transkrip/sinkron \
  -H "Authorization: Bearer $TOKEN_DOSEN" -H 'X-Device-ID: DEV-DOSEN-01' \
  -H 'Content-Type: application/json' \
  -d '{"kelas_id":1,"kode_mk":"IF101","nama_mk":"Pemrograman Web","entries":[{"nim":"2470001","nilai_angka":95,"nilai_huruf":"A"}]}'
```

### T23 — Token service ke GET /nilai atau GET /transkrip/:nim

```bash
curl -s $GATEWAY/nilai -H "Authorization: Bearer $TOKEN_SERVICE"
curl -s $GATEWAY/transkrip/2470001 -H "Authorization: Bearer $TOKEN_SERVICE"
```

### T24 — Refresh dengan token valid

```bash
curl -s -X POST $GATEWAY/auth/refresh \
  -H 'Content-Type: application/json' -H 'X-Device-ID: DEV-MHS-01' \
  -d "{\"refresh_token\":\"$REFRESH\"}"
```

### T25 — Logout lalu refresh

```bash
curl -s -o /dev/null -w '%{http_code}\n' -X POST $GATEWAY/auth/logout \
  -H 'Content-Type: application/json' -H 'X-Device-ID: DEV-MHS-01' \
  -d "{\"refresh_token\":\"$REFRESH\"}"
curl -s -X POST $GATEWAY/auth/refresh \
  -H 'Content-Type: application/json' -H 'X-Device-ID: DEV-MHS-01' \
  -d "{\"refresh_token\":\"$REFRESH\"}"
```

### T26 — Rute tak dikenal

```bash
curl -s $GATEWAY/admin
```

### T27 — Audit log (20 baris terakhir)

```bash
node -e "const db=require('./db/index');console.table(db.prepare('SELECT ts,subject,subject_type,method,endpoint,decision,reason FROM audit_log ORDER BY id DESC LIMIT 20').all());db.close();"
```
