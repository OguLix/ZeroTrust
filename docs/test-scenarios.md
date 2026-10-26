# Skenario Uji (versi curl) — untuk demo

Versi curl dari skenario T01-T27 (Bagian 12 AGENT.md) untuk video demo. Script
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

TODO(Tahap 7): lengkapi perintah curl nyata di bawah, satu blok per skenario, sesuai
urutan ID di atas.
