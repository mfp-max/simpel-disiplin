-- 0009 — Riwayat pegawai yang membeku (PRD §18.3)
--
-- Master pegawai selalu berisi keadaan TERKINI (diganti tiap impor Simpega / suntingan).
-- Kasus harus tetap memakai keadaan SAAT ITU: jabatan, pangkat, unit, atasan langsung,
-- dan susunan Tim Pemeriksa. Migrasi ini:
--   1. menambah salinan beku untuk anggota Tim Pemeriksa;
--   2. melengkapi salinan lama (pengisian awal, ditandai "pengisian_awal" karena diambil
--      dari master saat migrasi, bukan saat kejadian);
--   3. mengunci salinan beku entri hukdis & anggota tim dengan pemicu basis data.
-- Hanya menambah (aturan migrasi SIMPEL).

alter table anggota_tim add column if not exists snapshot_pegawai jsonb;

-- 2a. Anggota tim lama: salinan dari master saat ini (terbaik yang tersedia).
update anggota_tim a set snapshot_pegawai = jsonb_build_object(
    'id', p.id, 'nip', p.nip, 'nama_lengkap_gelar', p.nama_lengkap_gelar, 'pangkat', p.pangkat,
    'golongan_ruang', coalesce(a.golongan_ruang, p.golongan_ruang), 'golongan_pangkat', p.golongan_pangkat,
    'jabatan', coalesce(nullif(p.jabatan_tambahan, ''), p.jabatan_fungsional, p.jenis_pegawai), 'unit_kerja', p.unit_kerja,
    'dicatat_pada', now(), 'sumber', 'pengisian_awal')
  from pegawai p
  where p.id = a.pegawai_id and a.snapshot_pegawai is null;

-- 2b. Entri lama: tambahkan atasan langsung (pejabat penilai) ke salinan bila belum ada.
update entri e set snapshot_pegawai = e.snapshot_pegawai || jsonb_build_object(
    'pejabat_penilai_nip', p.pejabat_penilai_nip, 'atasan_nama', a.nama_lengkap_gelar, 'atasan_nip', a.nip,
    'atasan_jabatan', coalesce(nullif(a.jabatan_tambahan, ''), a.jabatan_fungsional, a.jenis_pegawai), 'atasan_sumber', 'pengisian_awal')
  from pegawai p join pegawai a on a.nip = p.pejabat_penilai_nip
  where p.id = e.pegawai_id and e.snapshot_pegawai is not null and not (e.snapshot_pegawai ? 'atasan_nama');

-- 3. Pengunci. Koreksi salah ketik tetap mungkin lewat izinkanKoreksi() (lib/db.ts), yang wajib
--    disertai alasan di log audit — sama seperti salinan pasal & jenis hukuman.
create or replace function riwayat_pegawai_kekal() returns trigger
language plpgsql as $$
begin
  if coalesce(current_setting('simpel.izin_koreksi', true), '') = '1' then
    return new;
  end if;
  if tg_table_name = 'entri' then
    if old.kelas = 'hukdis' and old.snapshot_pegawai is not null and new.snapshot_pegawai is distinct from old.snapshot_pegawai then
      raise exception 'SIMPEL_SNAPSHOT_KEKAL: data pegawai pada kasus yang sudah tercatat tidak boleh diubah (riwayat memakai keadaan saat kasus dicatat).';
    end if;
  elsif tg_table_name = 'anggota_tim' then
    if old.snapshot_pegawai is not null and new.snapshot_pegawai is distinct from old.snapshot_pegawai then
      raise exception 'SIMPEL_SNAPSHOT_KEKAL: data anggota Tim Pemeriksa yang sudah ditetapkan tidak boleh diubah.';
    end if;
  end if;
  return new;
end $$;

drop trigger if exists entri_pegawai_kekal on entri;
create trigger entri_pegawai_kekal before update on entri for each row execute function riwayat_pegawai_kekal();
drop trigger if exists anggota_tim_kekal on anggota_tim;
create trigger anggota_tim_kekal before update on anggota_tim for each row execute function riwayat_pegawai_kekal();
