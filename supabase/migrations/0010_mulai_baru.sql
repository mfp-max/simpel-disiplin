-- 0010 — Mulai baru sebelum dipakai sungguhan (permintaan pemilik aplikasi, 26 Oktober 2026)
--
-- Mengosongkan SEMUA data uji coba: informasi, kasus, pembinaan, arsip, dokumen, berkas,
-- sesi pemeriksaan, data simulasi, 998 pegawai dummy (impor Simpega uji), catatan kehadiran,
-- riwayat impor, nomor registrasi, dan log audit uji coba.
-- TETAP: pengaturan, peran & pengguna, peraturan & katalog aturan, template dokumen,
-- placeholder, pertanyaan baku/bank, hari libur, golongan, unit kerja, kode referensi,
-- pemetaan status pegawai, profil pemetaan impor.
--
-- Pengaman: hanya berjalan sebelum 5 November 2026. Bila migrasi ini suatu hari dijalankan
-- pada basis data baru/pulihan (mis. bangun ulang dari cadangan), tidak ada yang dihapus.
-- Berkas di penyimpanan (folder entri/) yang kehilangan entrinya dibersihkan oleh
-- scripts/bersihkan-berkas-yatim.mjs saat build produksi.

do $$
begin
  if now() >= timestamptz '2026-11-05 00:00:00+07' then
    raise notice 'Mulai baru dilewati: lewat batas waktu sekali-jalan.';
    return;
  end if;

  -- Pemicu "kekal" sengaja dimatikan sementara HANYA di dalam transaksi migrasi ini.
  alter table audit_log disable trigger user;
  alter table dokumen disable trigger user;
  alter table entri disable trigger user;
  alter table anggota_tim disable trigger user;
  alter table pelanggaran_entri disable trigger user;
  alter table hukuman disable trigger user;

  truncate table
    qa_pemeriksaan, sesi_pemeriksaan, anggota_tim, tim_pemeriksa, dokumen, berkas, pelanggaran_entri, tahapan_kasus,
    hukuman, upaya_administratif, penghentian_gaji, pembebasan_sementara, entri,
    catatan_kehadiran, pegawai, riwayat_impor, nomor_urut, audit_log;

  alter table audit_log enable trigger user;
  alter table dokumen enable trigger user;
  alter table entri enable trigger user;
  alter table anggota_tim enable trigger user;
  alter table pelanggaran_entri enable trigger user;
  alter table hukuman enable trigger user;

  -- Jejak pertama di log audit yang baru.
  insert into audit_log (email, aksi, tabel, ringkasan_perubahan, alasan)
  values ('sistem', 'hapus', 'semua_data_uji', jsonb_build_object('migrasi', '0010_mulai_baru'),
          'Mulai baru: semua data uji coba dikosongkan atas permintaan pemilik aplikasi sebelum dipakai untuk data sungguhan.');
end $$;
