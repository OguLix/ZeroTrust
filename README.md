# Sistem Nilai — Zero Trust Security

Sistem Nilai untuk program studi Informatika dengan pendekatan Zero Trust Security
(tugas praktikum Keamanan Informasi KP70065004, Informatika Universitas Siliwangi).
Dosen menginput dan memfinalisasi nilai kelas yang diampunya; setelah difinalisasi,
nilai dikirim ke Service Transkrip. Semua akses — termasuk panggilan antar-service —
diperiksa oleh API gateway.

Prinsip yang diterapkan: *never trust, always verify*, *least privilege*, dan
*assume breach*, mengikuti arsitektur NIST SP 800-207.

## Komponen

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
