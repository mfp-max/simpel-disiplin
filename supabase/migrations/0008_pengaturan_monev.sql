-- Pengaturan monitoring (PRD §10): batas "pegawai mendekati ambang kehadiran" di Beranda.
-- Hanya menambah baris; tidak menimpa nilai yang sudah diubah admin.
insert into pengaturan (kunci, nilai, label, kelompok, keterangan, urutan)
values ('ambang_dekat_kehadiran_hari', '2'::jsonb, 'Peringatan ambang kehadiran (hari sebelum ambang berikutnya)', 'sistem',
        'Pegawai ditampilkan di Beranda bila akumulasi tidak masuk kerja tahun berjalan tinggal sebanyak ini atau kurang dari ambang hukuman berikutnya.', 24)
on conflict (kunci) do nothing;
