-- Peran basis data khusus SIMPEL. Jalankan SEKALI pada proyek Supabase BARU,
-- lewat Supabase → SQL Editor (sebagai `postgres`), SEBELUM `npm run db:migrate`.
--
-- Ganti GANTI_DENGAN_KATA_SANDI dengan kata sandi acak panjang (huruf & angka saja,
-- agar aman di dalam URL). Kata sandi yang sama dipakai di DATABASE_URL dan
-- DATABASE_URL_MIGRASI dengan nama pengguna `simpel_app.<project-ref>`.
--
-- Hasilnya sama dengan peran di proyek lama (dicek 2026-10-08):
--   login, bypassrls, anggota `postgres`, berhak USAGE + CREATE di skema public,
--   sehingga seluruh tabel yang dibuat migrasi dimiliki `simpel_app`.
--   RLS tetap aktif di semua tabel tanpa kebijakan anon (lihat scripts/migrasi.mjs).

create role simpel_app with login password 'GANTI_DENGAN_KATA_SANDI' bypassrls;
grant simpel_app to postgres;
grant usage, create on schema public to simpel_app;
