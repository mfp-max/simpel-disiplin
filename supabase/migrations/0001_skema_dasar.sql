-- =====================================================================
-- SIMPEL — Sistem Informasi Manajemen Pelanggaran
-- Migrasi 0001: skema dasar
--
-- PANTANGAN PERMANEN (lihat README):
--   Migrasi berikutnya HANYA boleh menambah (CREATE TABLE, ADD COLUMN ... NULL,
--   CREATE INDEX). Jangan pernah DROP / mengubah tipe kolom yang sudah terisi.
--   Aturan hukum (angka, daftar, tenggat, kewenangan) adalah ISI TABEL, bukan
--   skema. Menambah peraturan baru = menambah baris, bukan migrasi.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Fungsi bantu
-- ---------------------------------------------------------------------
create or replace function set_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

-- ---------------------------------------------------------------------
-- 1. Pengguna & hak akses
-- ---------------------------------------------------------------------
create table peran (
  kode               text primary key,
  nama               text not null,
  urutan             int  not null default 0,
  boleh_buat         boolean not null default false,
  boleh_ubah         boolean not null default false,
  boleh_ubah_status  boolean not null default false,
  boleh_arsipkan     boolean not null default false,
  kelola_pengaturan  boolean not null default false,
  boleh_musnahkan    boolean not null default false,
  boleh_lihat_audit  boolean not null default false,
  keterangan         text,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

create table app_users (
  id             uuid primary key default gen_random_uuid(),
  email          text not null,
  nama           text not null,
  jabatan        text,
  peran_kode     text not null references peran(kode),
  aktif          boolean not null default true,
  clerk_user_id  text unique,
  terakhir_masuk timestamptz,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  created_by     uuid,
  updated_by     uuid
);
create unique index app_users_email_unik on app_users (lower(email));

-- Audit log: tidak bisa diubah/dihapus siapa pun.
create table audit_log (
  id                  bigint generated always as identity primary key,
  waktu               timestamptz not null default now(),
  user_id             uuid,
  email               text,
  aksi                text not null,   -- lihat|buat|ubah|hapus|arsipkan|unduh|cetak|ekspor|masuk|putar|impor|musnahkan
  tabel               text,
  record_id           text,
  entri_id            uuid,
  ringkasan_perubahan jsonb,
  alasan              text,
  ip                  text,
  user_agent          text
);
create index audit_log_entri_idx on audit_log (entri_id);
create index audit_log_waktu_idx on audit_log (waktu desc);
create index audit_log_user_idx  on audit_log (user_id);

create or replace function tolak_ubah_audit() returns trigger
language plpgsql as $$
begin
  raise exception 'SIMPEL_AUDIT_KEKAL: audit log tidak boleh diubah atau dihapus';
end $$;
create trigger audit_log_kekal_baris before update or delete on audit_log
  for each row execute function tolak_ubah_audit();
create trigger audit_log_kekal_truncate before truncate on audit_log
  for each statement execute function tolak_ubah_audit();

-- Pengaturan umum (nama rektor, tempat surat, retensi, dll.)
create table pengaturan (
  kunci      text primary key,
  nilai      jsonb,
  label      text not null,
  kelompok   text not null default 'umum',
  keterangan text,
  urutan     int not null default 0,
  updated_at timestamptz not null default now(),
  updated_by uuid
);

-- Kode referensi serbaguna (pengganti ENUM untuk nilai yang bisa bertambah)
create table kode_referensi (
  kategori   text not null,
  kode       text not null,
  label      text not null,
  urutan     int  not null default 0,
  aktif      boolean not null default true,
  keterangan text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (kategori, kode)
);

-- Penomoran berurutan (nomor registrasi, dll.)
create table nomor_urut (
  kunci text primary key,
  nilai int  not null default 0
);

-- ---------------------------------------------------------------------
-- 2. Katalog aturan (semua terikat regulasi_id)
-- ---------------------------------------------------------------------
create table rezim (
  kode       text primary key,
  nama       text not null,
  keterangan text,
  urutan     int not null default 0,
  aktif      boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table pemetaan_status_pegawai (
  status_pegawai text primary key,
  rezim_kode     text references rezim(kode),   -- null = perlu verifikasi manual
  keterangan     text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create table regulasi (
  id                    uuid primary key default gen_random_uuid(),
  kode                  text not null unique,
  jenis                 text not null,                 -- PP, Peraturan BKN, Kepmen, Peraturan Rektor, ...
  nomor                 text,
  tahun                 int,
  judul                 text not null,
  nama_singkat          text not null,                 -- "PP 94/2021"
  nama_lengkap          text,                          -- dipakai di dokumen
  rezim_kode            text references rezim(kode),
  utama                 boolean not null default false, -- dapat menjadi dasar kasus (dipilih resolver)
  status                text not null default 'aktif' check (status in ('draf','aktif','nonaktif')),
  berlaku_dari          date,
  berlaku_sampai        date,
  ditetapkan_pada       date,
  menggantikan_id       uuid references regulasi(id),
  digantikan_oleh_id    uuid references regulasi(id),
  versi                 int not null default 1,
  katalog_pasal_lengkap boolean not null default true,  -- false: pasal diisi teks bebas (arsip lama)
  catatan               text,
  peringatan            text,
  perlu_verifikasi      boolean not null default false,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  created_by            uuid,
  updated_by            uuid
);

create table regulasi_terkait (
  id          uuid primary key default gen_random_uuid(),
  regulasi_id uuid not null references regulasi(id),
  terkait_id  uuid not null references regulasi(id),
  peran       text not null default 'pelengkap',  -- juknis | delegasi | pelengkap | dasar
  urutan      int not null default 0,
  keterangan  text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (regulasi_id, terkait_id)
);

create table tingkat_hukuman (
  id                 uuid primary key default gen_random_uuid(),
  regulasi_id        uuid not null references regulasi(id),
  kode               text not null,
  nama               text not null,
  urutan             int  not null,
  aktif              boolean not null default true,
  keterangan         text,
  versi              int not null default 1,
  digantikan_oleh_id uuid references tingkat_hukuman(id),
  berlaku_sampai     date,
  catatan            text,
  perlu_verifikasi   boolean not null default false,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  created_by         uuid,
  updated_by         uuid,
  unique (regulasi_id, kode)
);

create table jenis_hukuman (
  id                      uuid primary key default gen_random_uuid(),
  regulasi_id             uuid not null references regulasi(id),
  tingkat_hukuman_id      uuid not null references tingkat_hukuman(id),
  kode                    text not null,
  nama                    text not null,
  urutan                  int  not null default 0,
  durasi_bulan            int,
  aktif                   boolean not null default true,
  pengganti_sementara_id  uuid references jenis_hukuman(id),
  peringatan              text,
  catatan                 text,
  pasal_rujukan           text,
  blokir_kgb              boolean not null default false,
  blokir_kenaikan_pangkat boolean not null default false,
  versi                   int not null default 1,
  digantikan_oleh_id      uuid references jenis_hukuman(id),
  berlaku_sampai          date,
  perlu_verifikasi        boolean not null default false,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now(),
  created_by              uuid,
  updated_by              uuid,
  unique (regulasi_id, kode)
);

create table pasal_regulasi (
  id                         uuid primary key default gen_random_uuid(),
  regulasi_id                uuid not null references regulasi(id),
  jenis                      text not null,      -- kewajiban | larangan | hukuman | prosedur | lainnya
  pasal                      text not null,
  ayat                       text,
  huruf                      text,
  angka                      text,
  teks                       text not null,
  tingkat_hukuman_terkait_id uuid references tingkat_hukuman(id),
  urutan                     int not null default 0,
  perlu_verifikasi           boolean not null default false,
  aktif                      boolean not null default true,
  versi                      int not null default 1,
  digantikan_oleh_id         uuid references pasal_regulasi(id),
  berlaku_sampai             date,
  catatan                    text,
  created_at                 timestamptz not null default now(),
  updated_at                 timestamptz not null default now(),
  created_by                 uuid,
  updated_by                 uuid
);
create index pasal_regulasi_reg_idx on pasal_regulasi (regulasi_id, jenis, urutan);

create table ambang_kehadiran (
  id                 uuid primary key default gen_random_uuid(),
  regulasi_id        uuid not null references regulasi(id),
  hari_min           int  not null,
  hari_max           int,                    -- null = tak terhingga
  berturut_turut     boolean not null default false,
  tingkat_hukuman_id uuid references tingkat_hukuman(id),
  jenis_hukuman_id   uuid references jenis_hukuman(id),
  pasal_rujukan      text,
  akibat_tambahan    text,
  alur_khusus        text,                   -- mis. 'penghentian_gaji'
  urutan             int not null default 0,
  aktif              boolean not null default true,
  versi              int not null default 1,
  digantikan_oleh_id uuid references ambang_kehadiran(id),
  berlaku_sampai     date,
  catatan            text,
  perlu_verifikasi   boolean not null default false,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  created_by         uuid,
  updated_by         uuid
);
create index ambang_reg_idx on ambang_kehadiran (regulasi_id);

create table aturan_tenggat (
  id                uuid primary key default gen_random_uuid(),
  regulasi_id       uuid not null references regulasi(id),
  kode              text not null,
  nama_tenggat      text not null,
  kode_tahap        text not null,           -- tahap yang dikenai tenggat
  dihitung_dari     text not null,           -- kode tahap acuan
  acuan_tanggal     text not null default 'realisasi' check (acuan_tanggal in ('realisasi','rencana')),
  arah              text not null check (arah in ('sebelum','sesudah')),
  jumlah            int  not null,
  satuan            text not null check (satuan in ('hari_kerja','hari_kalender','bulan')),
  hitung_hari_dasar boolean not null default false,  -- apakah hari acuan dihitung sebagai hari ke-1
  sifat             text not null default 'wajib_hukum' check (sifat in ('wajib_hukum','pengingat_internal')),
  pasal_rujukan     text,
  catatan           text,
  aktif             boolean not null default true,
  perlu_verifikasi  boolean not null default false,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  created_by        uuid,
  updated_by        uuid,
  unique (regulasi_id, kode)
);

create table aturan_kewenangan (
  id                 uuid primary key default gen_random_uuid(),
  regulasi_id        uuid not null references regulasi(id),
  tingkat_hukuman_id uuid references tingkat_hukuman(id),  -- null = semua tingkat
  jenis              text not null check (jenis in ('pemeriksa','pembentuk_tim','penjatuh')),
  peran_kode         text not null,
  nama_peran         text not null,
  lingkup            text,
  syarat_tambahan    jsonb not null default '{}'::jsonb,
  hasil              jsonb not null default '{}'::jsonb,
  prioritas          int not null default 100,
  pasal_rujukan      text,
  catatan            text,
  aktif              boolean not null default true,
  perlu_verifikasi   boolean not null default false,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  created_by         uuid,
  updated_by         uuid
);
create index kewenangan_reg_idx on aturan_kewenangan (regulasi_id, jenis, prioritas);

create table aturan_tahapan (
  id                 uuid primary key default gen_random_uuid(),
  regulasi_id        uuid not null references regulasi(id),
  tingkat_hukuman_id uuid references tingkat_hukuman(id),  -- null = semua tingkat
  kode_tahap         text not null,
  nama               text not null,
  urutan             int  not null,
  opsional           boolean not null default false,
  kondisi            jsonb not null default '{}'::jsonb,
  status_kasus       text,           -- status kasus ketika tahap ini berjalan
  pasal_rujukan      text,
  bantuan            text,
  jenis_dokumen      text[] not null default '{}',
  aktif              boolean not null default true,
  perlu_verifikasi   boolean not null default false,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  created_by         uuid,
  updated_by         uuid
);
create index tahapan_reg_idx on aturan_tahapan (regulasi_id, urutan);

create table aturan_pemetaan_pelanggaran (
  id                     uuid primary key default gen_random_uuid(),
  regulasi_id            uuid not null references regulasi(id),
  pasal_regulasi_id      uuid references pasal_regulasi(id),  -- null = berlaku untuk semua pasal kewajiban/larangan
  dampak                 text not null,
  tingkat_hukuman_id     uuid not null references tingkat_hukuman(id),
  pasal_rujukan_pemetaan text,
  catatan                text,
  aktif                  boolean not null default true,
  perlu_verifikasi       boolean not null default false,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now(),
  created_by             uuid,
  updated_by             uuid
);
create index pemetaan_reg_idx on aturan_pemetaan_pelanggaran (regulasi_id);

create table aturan_kaidah (
  id               uuid primary key default gen_random_uuid(),
  regulasi_id      uuid not null references regulasi(id),
  kunci            text not null,
  nilai            jsonb,
  pasal_rujukan    text,
  catatan          text,
  perlu_verifikasi boolean not null default false,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  created_by       uuid,
  updated_by       uuid,
  unique (regulasi_id, kunci)
);

create table fixture_regresi (
  id              uuid primary key default gen_random_uuid(),
  regulasi_id     uuid not null references regulasi(id),
  nama            text not null,
  masukan         jsonb not null,
  harapan         jsonb not null,
  hasil_terakhir  jsonb,
  lulus           boolean,
  dijalankan_pada timestamptz,
  catatan         text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  created_by      uuid,
  updated_by      uuid
);

create table hari_libur (
  id         uuid primary key default gen_random_uuid(),
  tanggal    date not null unique,
  nama       text not null,
  jenis      text not null check (jenis in ('libur_nasional','cuti_bersama')),
  keterangan text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid,
  updated_by uuid
);

create table golongan_ruang (
  kode       text primary key,     -- "III/b"
  pangkat    text not null,        -- "Penata Muda Tingkat I"
  urutan     int  not null,        -- untuk membandingkan jenjang
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- 3. Master pegawai & unit kerja
-- ---------------------------------------------------------------------
create table unit_kerja (
  id                           uuid primary key default gen_random_uuid(),
  nama                         text not null,
  induk_id                     uuid references unit_kerja(id),
  jenis                        text,
  jabatan_pimpinan             text,
  punya_delegasi_hukdis_ringan boolean not null default false,
  aktif                        boolean not null default true,
  keterangan                   text,
  created_at                   timestamptz not null default now(),
  updated_at                   timestamptz not null default now(),
  created_by                   uuid,
  updated_by                   uuid
);
create unique index unit_kerja_nama_unik on unit_kerja (lower(nama));

create table pegawai (
  id                         uuid primary key default gen_random_uuid(),
  nip                        text unique,
  nip_lama                   text,
  nama_lengkap_gelar         text not null,
  nama_tanpa_gelar           text,
  jenis_kelamin              text check (jenis_kelamin in ('L','P')),
  tempat_lahir               text,
  tanggal_lahir              date,
  email_resmi                text,
  status_pegawai             text,
  jenis_pegawai              text,
  kelompok_jabatan           text,
  golongan_pangkat           text,
  pangkat                    text,
  golongan_ruang             text,
  tmt_golongan               date,
  jabatan_fungsional         text,
  tmt_jabatan_fungsional     date,
  jabatan_tambahan           text,
  unit_kerja                 text,
  unit_kerja_id              uuid references unit_kerja(id),
  subag_unit_kerja           text,
  unit_kerja_induk           text,
  direktorat_fakultas        text,
  pejabat_penilai_nip        text,
  atasan_pejabat_penilai_nip text,
  tanggal_masuk              date,
  tanggal_keluar             date,
  rezim_kode                 text references rezim(kode),
  rezim_manual               boolean not null default false,
  aktif                      boolean not null default true,
  sumber                     text not null default 'manual',  -- impor_excel | api_simpega | manual
  sumber_sinkron_terakhir    timestamptz,
  field_manual               text[] not null default '{}',
  data_tambahan              jsonb not null default '{}'::jsonb,
  diarsipkan_pada            timestamptz,
  created_at                 timestamptz not null default now(),
  updated_at                 timestamptz not null default now(),
  created_by                 uuid,
  updated_by                 uuid,
  cari tsvector generated always as (
    to_tsvector('simple', coalesce(nama_lengkap_gelar,'') || ' ' || coalesce(nip,'') || ' ' || coalesce(nip_lama,'') || ' ' || coalesce(unit_kerja,''))
  ) stored
);
create index pegawai_cari_idx on pegawai using gin (cari);
create index pegawai_nama_idx on pegawai (lower(nama_lengkap_gelar));
create index pegawai_unit_idx on pegawai (unit_kerja_id);

create table profil_impor (
  id         uuid primary key default gen_random_uuid(),
  nama       text not null,
  pemetaan   jsonb not null,     -- { "<indeks kolom>": "<field tujuan>" }
  keterangan text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid,
  updated_by uuid
);

create table riwayat_impor (
  id             uuid primary key default gen_random_uuid(),
  nama_file      text,
  profil_id      uuid references profil_impor(id),
  jumlah_baris   int not null default 0,
  jumlah_baru    int not null default 0,
  jumlah_diperbarui int not null default 0,
  jumlah_ditolak int not null default 0,
  rincian_tolak  jsonb,
  pemetaan       jsonb,
  created_at     timestamptz not null default now(),
  created_by     uuid
);

-- ---------------------------------------------------------------------
-- 4. Transaksi: entri & turunannya
-- ---------------------------------------------------------------------
create table kelas_entri (
  kode       text primary key,      -- informasi | non_hukdis | arsip | hukdis
  nama       text not null,
  prefix     text not null,         -- INF | NH | AR | HD
  hitung_sla boolean not null default true,
  urutan     int not null default 0,
  keterangan text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table status_kasus (
  kode       text primary key,
  nama       text not null,
  urutan     int not null default 0,
  kelompok   text not null,          -- informasi | berjalan | selesai | dihentikan
  warna      text,
  keterangan text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table entri (
  id                       uuid primary key default gen_random_uuid(),
  nomor_registrasi         text not null unique,
  kelas                    text not null references kelas_entri(kode),
  judul                    text not null,
  ringkasan                text,
  tanggal_peristiwa        date,
  tahun_peristiwa          int,
  pegawai_id               uuid references pegawai(id),
  nama_pegawai_bebas       text,
  nip_bebas                text,
  unit_kerja_id            uuid references unit_kerja(id),
  unit_kerja_bebas         text,
  snapshot_pegawai         jsonb,
  regulasi_id              uuid references regulasi(id),
  rezim_kode               text references rezim(kode),
  snapshot_regulasi        jsonb,
  status_kasus             text not null references status_kasus(kode),
  tingkat_hukuman_dugaan_id uuid references tingkat_hukuman(id),
  jenis_hukuman_id         uuid references jenis_hukuman(id),
  sumber_informasi         text,
  pelapor_nama             text,
  pelapor_kontak           text,
  ada_bukti                boolean not null default false,
  hitung_dalam_sla         boolean not null default true,
  kelengkapan_berkas       text,
  pemotongan_ik            boolean not null default false,
  rahasia_tingkat          text not null default 'rahasia',
  catatan_internal         text,
  jenis_non_hukdis         text,
  berasal_dari_id          uuid references entri(id),
  dinaikkan_ke_id          uuid references entri(id),
  alasan_penghentian       text,
  tanggal_selesai          date,
  pic_user_id              uuid references app_users(id),
  kalkulasi                jsonb,                       -- salinan hasil mesin aturan (kewenangan, ambang)
  data_tambahan            jsonb not null default '{}'::jsonb,
  diarsipkan_pada          timestamptz,
  diarsipkan_oleh          uuid,
  alasan_diarsipkan        text,
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now(),
  created_by               uuid,
  updated_by               uuid,
  cari tsvector generated always as (
    to_tsvector('simple',
      coalesce(nomor_registrasi,'') || ' ' || coalesce(judul,'') || ' ' || coalesce(ringkasan,'') || ' ' ||
      coalesce(nama_pegawai_bebas,'') || ' ' || coalesce(nip_bebas,'') || ' ' || coalesce(pelapor_nama,''))
  ) stored
);
create index entri_kelas_idx   on entri (kelas, status_kasus);
create index entri_pegawai_idx on entri (pegawai_id);
create index entri_cari_idx    on entri using gin (cari);

create table pelanggaran_entri (
  id                uuid primary key default gen_random_uuid(),
  entri_id          uuid not null references entri(id),
  pasal_regulasi_id uuid references pasal_regulasi(id),
  pasal_teks_bebas  text,
  snapshot_pasal    jsonb,
  uraian_perbuatan  text,
  dampak            text,
  waktu             text,
  tempat            text,
  urutan            int not null default 0,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  created_by        uuid,
  updated_by        uuid
);
create index pelanggaran_entri_idx on pelanggaran_entri (entri_id);

create table tahapan_kasus (
  id                uuid primary key default gen_random_uuid(),
  entri_id          uuid not null references entri(id),
  kode_tahap        text not null,
  urutan            int  not null,
  nama              text not null,
  status            text not null default 'belum' check (status in ('belum','berjalan','selesai','dilewati')),
  opsional          boolean not null default false,
  tanggal_rencana   date,
  tanggal_realisasi date,
  tenggat           date,
  tenggat_info      jsonb,
  pic_user_id       uuid references app_users(id),
  catatan           text,
  snapshot_aturan   jsonb,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  created_by        uuid,
  updated_by        uuid
);
create index tahapan_kasus_entri_idx on tahapan_kasus (entri_id, urutan);

create table tim_pemeriksa (
  id                        uuid primary key default gen_random_uuid(),
  entri_id                  uuid not null references entri(id),
  jenis                     text not null,     -- atasan_langsung | unit_kerja | um
  nomor_sk                  text,
  tanggal_sk                date,
  pejabat_pembentuk         text,
  dilaporkan_ke_sekjen_pada date,
  catatan                   text,
  created_at                timestamptz not null default now(),
  updated_at                timestamptz not null default now(),
  created_by                uuid,
  updated_by                uuid
);

create table anggota_tim (
  id                       uuid primary key default gen_random_uuid(),
  tim_id                   uuid not null references tim_pemeriksa(id),
  pegawai_id               uuid references pegawai(id),
  nama_bebas               text,
  nip_bebas                text,
  jabatan_bebas            text,
  golongan_ruang           text,
  unsur                    text not null,
  jabatan_dalam_tim        text not null,
  pernyataan_bebas_konflik boolean not null default false,
  eselon_setara            int,
  urutan                   int not null default 0,
  catatan                  text,
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now(),
  created_by               uuid,
  updated_by               uuid
);

-- ---------------------------------------------------------------------
-- 5. Template & dokumen
-- ---------------------------------------------------------------------
create table template_placeholder (
  kode       text primary key,
  label      text not null,
  kelompok   text not null,
  jenis      text not null default 'teks' check (jenis in ('teks','loop')),
  sumber     text not null default 'bawaan',   -- bawaan | pengaturan:<kunci> | manual
  deskripsi  text,
  contoh     text,
  field      jsonb,                            -- untuk loop: daftar field
  urutan     int not null default 0,
  aktif      boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table template_dokumen (
  id             uuid primary key default gen_random_uuid(),
  kode           text not null unique,
  nama           text not null,
  jenis_dokumen  text not null,
  rezim_kode     text[] not null default '{}',   -- kosong = semua rezim
  tingkat_kode   text[] not null default '{}',   -- kosong = semua tingkat
  tahap_kode     text[] not null default '{}',   -- tahap tempat template ditawarkan
  aktif          boolean not null default true,
  versi_aktif_id uuid,
  keterangan     text,
  urutan         int not null default 0,
  diarsipkan_pada timestamptz,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  created_by     uuid,
  updated_by     uuid
);

create table template_versi (
  id          uuid primary key default gen_random_uuid(),
  template_id uuid not null references template_dokumen(id),
  versi       int  not null,
  file_path   text not null,
  nama_file   text,
  ukuran      bigint,
  placeholder jsonb not null default '[]'::jsonb,
  pemetaan    jsonb not null default '{}'::jsonb,
  catatan     text,
  created_at  timestamptz not null default now(),
  created_by  uuid,
  unique (template_id, versi)
);
alter table template_dokumen
  add constraint template_versi_aktif_fk foreign key (versi_aktif_id) references template_versi(id);

create table dokumen (
  id                uuid primary key default gen_random_uuid(),
  entri_id          uuid not null references entri(id),
  tahapan_id        uuid references tahapan_kasus(id),
  jenis_dokumen     text not null,
  judul             text,
  nomor             text,
  tanggal           date,
  template_id       uuid references template_dokumen(id),
  template_versi_id uuid references template_versi(id),
  data_isian        jsonb not null default '{}'::jsonb,
  snapshot_data     jsonb,
  file_path         text,
  versi             int not null default 1,
  status            text not null default 'draf' check (status in ('draf','final','ditandatangani')),
  dibuat_oleh       uuid references app_users(id),
  diarsipkan_pada   timestamptz,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  created_by        uuid,
  updated_by        uuid
);
create index dokumen_entri_idx on dokumen (entri_id);

create table berkas (
  id              uuid primary key default gen_random_uuid(),
  entri_id        uuid references entri(id),
  nama_file       text not null,
  file_path       text not null,
  mime            text,
  ukuran          bigint,
  kategori        text not null default 'lainnya',
  keterangan      text,
  teks_ocr        text,
  diarsipkan_pada timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  created_by      uuid,
  updated_by      uuid,
  cari tsvector generated always as (
    to_tsvector('simple', coalesce(nama_file,'') || ' ' || coalesce(keterangan,'') || ' ' || coalesce(teks_ocr,''))
  ) stored
);
create index berkas_entri_idx on berkas (entri_id);
create index berkas_cari_idx  on berkas using gin (cari);

-- ---------------------------------------------------------------------
-- 6. Pemeriksaan (mode sidang)
-- ---------------------------------------------------------------------
create table pertanyaan_baku (
  id         uuid primary key default gen_random_uuid(),
  bagian     text not null check (bagian in ('pembuka','penutup')),
  urutan     int not null,
  pertanyaan text not null,
  aktif      boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid,
  updated_by uuid
);

create table bank_pertanyaan (
  id                uuid primary key default gen_random_uuid(),
  nama_set          text not null,
  jenis_pelanggaran text,
  urutan            int not null default 0,
  pertanyaan        text not null,
  aktif             boolean not null default true,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  created_by        uuid,
  updated_by        uuid
);

create table sesi_pemeriksaan (
  id                          uuid primary key default gen_random_uuid(),
  entri_id                    uuid not null references entri(id),
  urutan                      int  not null default 1,
  status                      text not null default 'direncanakan' check (status in ('direncanakan','berjalan','selesai')),
  tanggal                     date,
  jam_mulai                   time,
  jam_selesai                 time,
  mulai_pada                  timestamptz,
  selesai_pada                timestamptz,
  tempat                      text,
  moda                        text not null default 'tatap_muka',
  terperiksa_hadir            boolean,
  notulis_user_id             uuid references app_users(id),
  persetujuan_rekam           boolean not null default false,
  persetujuan_ditolak         boolean not null default false,
  persetujuan_rekam_file      text,
  rekaman_path                text,
  rekaman_jumlah_potongan     int not null default 0,
  rekaman_durasi_detik        int,
  rekaman_hapus_pada          date,
  rekaman_diperpanjang        boolean not null default false,
  rekaman_alasan_perpanjangan text,
  rekaman_dihapus_pada        timestamptz,
  catatan                     text,
  created_at                  timestamptz not null default now(),
  updated_at                  timestamptz not null default now(),
  created_by                  uuid,
  updated_by                  uuid
);
create index sesi_entri_idx on sesi_pemeriksaan (entri_id);

create table qa_pemeriksaan (
  id                uuid primary key default gen_random_uuid(),
  sesi_id           uuid not null references sesi_pemeriksaan(id),
  urutan            int  not null,
  pertanyaan        text not null,
  jawaban           text,
  kategori          text not null default 'substansi' check (kategori in ('pembuka','substansi','penutup')),
  terakhir_disimpan timestamptz,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  created_by        uuid,
  updated_by        uuid
);
create index qa_sesi_idx on qa_pemeriksaan (sesi_id, urutan);

-- ---------------------------------------------------------------------
-- 7. Hasil & cabang proses
-- ---------------------------------------------------------------------
create table hukuman (
  id                      uuid primary key default gen_random_uuid(),
  entri_id                uuid not null references entri(id),
  jenis_hukuman_id        uuid references jenis_hukuman(id),
  snapshot_jenis_hukuman  jsonb,
  nomor_sk                text,
  tanggal_sk              date,
  pejabat_penjatuh        text,
  snapshot_pejabat        jsonb,
  tanggal_penyampaian     date,
  tanggal_diterima_pegawai date,
  tanggal_mulai_berlaku   date,
  tanggal_selesai         date,
  pemotongan_ik           boolean not null default false,
  blokir_kgb              boolean not null default false,
  blokir_kenaikan_pangkat boolean not null default false,
  catatan                 text,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now(),
  created_by              uuid,
  updated_by              uuid
);
create index hukuman_entri_idx on hukuman (entri_id);

create table upaya_administratif (
  id                uuid primary key default gen_random_uuid(),
  entri_id          uuid not null references entri(id),
  jenis             text not null,      -- keberatan | banding
  tanggal_pengajuan date,
  diajukan_kepada   text,
  tenggat_pengingat date,
  tanggal_putusan   date,
  hasil             text,               -- dikuatkan | diperingan | dibatalkan | diperberat
  nomor_putusan     text,
  catatan           text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  created_by        uuid,
  updated_by        uuid
);

create table penghentian_gaji (
  id                   uuid primary key default gen_random_uuid(),
  entri_id             uuid not null references entri(id),
  tanggal_mulai_tmk    date,
  jumlah_hari_berturut int,
  tanggal_lapor_atasan date,
  tanggal_verval       date,
  tanggal_ke_kpa       date,
  tanggal_sk_kpa       date,
  nomor_sk_kpa         text,
  status               text not null default 'berjalan',
  catatan              text,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  created_by           uuid,
  updated_by           uuid
);

create table pembebasan_sementara (
  id              uuid primary key default gen_random_uuid(),
  entri_id        uuid not null references entri(id),
  nomor_sk        text,
  tanggal_sk      date,
  tanggal_mulai   date,
  tanggal_selesai date,
  catatan         text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  created_by      uuid,
  updated_by      uuid
);

-- Catatan TMK (tidak masuk kerja) per pegawai, untuk akumulasi tahun berjalan
create table catatan_kehadiran (
  id              uuid primary key default gen_random_uuid(),
  pegawai_id      uuid not null references pegawai(id),
  tahun           int  not null,
  bulan           int  not null check (bulan between 1 and 12),
  jumlah_hari     int  not null default 0,
  berturut_maks   int,
  sumber          text,
  keterangan      text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  created_by      uuid,
  updated_by      uuid,
  unique (pegawai_id, tahun, bulan)
);

-- ---------------------------------------------------------------------
-- 8. Penjaga kekekalan (§18.3 & §18.4)
-- ---------------------------------------------------------------------

-- Katalog yang sudah dipakai: tidak boleh DELETE, kolom substantif tidak boleh UPDATE.
-- Koreksi salah ketik diizinkan bila aplikasi menyetel simpel.izin_koreksi = '1'
-- (aplikasi wajib mencatat alasannya di audit_log).
create or replace function katalog_kekal() returns trigger
language plpgsql as $$
declare
  kolom_bebas text[] := array['aktif','status','berlaku_sampai','digantikan_oleh_id','catatan',
                              'perlu_verifikasi','peringatan','pengganti_sementara_id','urutan',
                              'updated_at','updated_by'];
  reg uuid;
  terpakai boolean;
begin
  if tg_table_name = 'regulasi' then
    reg := old.id;
  else
    reg := old.regulasi_id;
  end if;

  terpakai := exists (select 1 from entri where regulasi_id = reg);
  if not terpakai and tg_table_name = 'pasal_regulasi' then
    terpakai := exists (select 1 from pelanggaran_entri where pasal_regulasi_id = old.id);
  elsif not terpakai and tg_table_name = 'jenis_hukuman' then
    terpakai := exists (select 1 from hukuman where jenis_hukuman_id = old.id)
             or exists (select 1 from entri where jenis_hukuman_id = old.id);
  end if;

  if not terpakai then
    if tg_op = 'DELETE' then return old; end if;
    return new;
  end if;

  if tg_op = 'DELETE' then
    raise exception 'SIMPEL_KATALOG_TERPAKAI: data ini sudah dipakai oleh kasus sehingga tidak boleh dihapus. Nonaktifkan saja.';
  end if;

  if coalesce(current_setting('simpel.izin_koreksi', true), '') = '1' then
    return new;
  end if;

  if (to_jsonb(old) - kolom_bebas) is distinct from (to_jsonb(new) - kolom_bebas) then
    raise exception 'SIMPEL_KATALOG_TERPAKAI: data ini sudah dipakai oleh kasus. Perubahan isi harus dibuat sebagai versi baru, atau gunakan "Koreksi salah ketik" dengan alasan tertulis.';
  end if;
  return new;
end $$;

create trigger regulasi_kekal        before update or delete on regulasi         for each row execute function katalog_kekal();
create trigger tingkat_hukuman_kekal before update or delete on tingkat_hukuman  for each row execute function katalog_kekal();
create trigger jenis_hukuman_kekal   before update or delete on jenis_hukuman    for each row execute function katalog_kekal();
create trigger pasal_regulasi_kekal  before update or delete on pasal_regulasi   for each row execute function katalog_kekal();
create trigger ambang_kekal          before update or delete on ambang_kehadiran for each row execute function katalog_kekal();

-- Salinan beku tidak boleh diubah setelah terisi.
create or replace function snapshot_kekal() returns trigger
language plpgsql as $$
begin
  if coalesce(current_setting('simpel.izin_koreksi', true), '') = '1' then
    return new;
  end if;
  if tg_table_name = 'pelanggaran_entri' then
    if old.snapshot_pasal is not null and new.snapshot_pasal is distinct from old.snapshot_pasal then
      raise exception 'SIMPEL_SNAPSHOT_KEKAL: kutipan pasal yang sudah tercatat tidak boleh diubah.';
    end if;
  elsif tg_table_name = 'hukuman' then
    if old.snapshot_jenis_hukuman is not null and new.snapshot_jenis_hukuman is distinct from old.snapshot_jenis_hukuman then
      raise exception 'SIMPEL_SNAPSHOT_KEKAL: jenis hukuman pada SK yang sudah ditetapkan tidak boleh diubah.';
    end if;
  end if;
  return new;
end $$;
create trigger pelanggaran_snapshot_kekal before update on pelanggaran_entri for each row execute function snapshot_kekal();
create trigger hukuman_snapshot_kekal     before update on hukuman           for each row execute function snapshot_kekal();

-- Dokumen final/ditandatangani: isi beku, tidak boleh dihapus.
create or replace function dokumen_kekal() returns trigger
language plpgsql as $$
begin
  if tg_op = 'DELETE' then
    if old.status in ('final','ditandatangani') then
      raise exception 'SIMPEL_DOKUMEN_KEKAL: dokumen yang sudah final tidak boleh dihapus.';
    end if;
    return old;
  end if;
  if old.status in ('final','ditandatangani') and (
       new.snapshot_data is distinct from old.snapshot_data or
       new.template_versi_id is distinct from old.template_versi_id or
       new.file_path is distinct from old.file_path or
       new.data_isian is distinct from old.data_isian) then
    raise exception 'SIMPEL_DOKUMEN_KEKAL: dokumen yang sudah final tidak boleh diubah isinya. Buat versi baru.';
  end if;
  return new;
end $$;
create trigger dokumen_kekal before update or delete on dokumen for each row execute function dokumen_kekal();

-- Versi template: berkas tidak boleh diganti; tidak boleh dihapus bila sudah dipakai.
create or replace function template_versi_kekal() returns trigger
language plpgsql as $$
begin
  if tg_op = 'DELETE' then
    if exists (select 1 from dokumen where template_versi_id = old.id) then
      raise exception 'SIMPEL_TEMPLATE_KEKAL: versi template ini sudah dipakai dokumen dan tidak boleh dihapus.';
    end if;
    return old;
  end if;
  if new.file_path is distinct from old.file_path then
    raise exception 'SIMPEL_TEMPLATE_KEKAL: berkas versi template tidak boleh diganti. Unggah sebagai versi baru.';
  end if;
  if exists (select 1 from dokumen where template_versi_id = old.id)
     and new.pemetaan is distinct from old.pemetaan then
    raise exception 'SIMPEL_TEMPLATE_KEKAL: pemetaan versi template yang sudah dipakai tidak boleh diubah. Unggah sebagai versi baru.';
  end if;
  return new;
end $$;
create trigger template_versi_kekal before update or delete on template_versi for each row execute function template_versi_kekal();

-- ---------------------------------------------------------------------
-- 9. updated_at otomatis di semua tabel yang punya kolomnya
-- ---------------------------------------------------------------------
do $$
declare t record;
begin
  for t in
    select c.table_name from information_schema.columns c
    join information_schema.tables tb on tb.table_name = c.table_name and tb.table_schema = c.table_schema
    where c.table_schema = 'public' and c.column_name = 'updated_at' and tb.table_type = 'BASE TABLE'
  loop
    execute format('create trigger %I before update on %I for each row execute function set_updated_at()',
                   t.table_name || '_updated_at', t.table_name);
  end loop;
end $$;

-- ---------------------------------------------------------------------
-- 10. Row Level Security: aktif di SEMUA tabel, tanpa kebijakan untuk
--     anon/authenticated (akses data hanya lewat server).
-- ---------------------------------------------------------------------
do $$
declare t record;
begin
  for t in select tablename from pg_tables where schemaname = 'public' loop
    execute format('alter table %I enable row level security', t.tablename);
    execute format('revoke all on table %I from anon, authenticated', t.tablename);
  end loop;
end $$;
