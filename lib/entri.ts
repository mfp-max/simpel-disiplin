import "server-only";
import { sql, type Sql } from "@/lib/db";
import { GalatPengguna } from "@/lib/galat";

/** Nomor registrasi berurutan: SIMPEL/{PREFIX}/{TAHUN}/{URUT4} (PRD §6.2). */
export async function nomorRegistrasi(tx: Sql, kelas: string, tahun: number) {
  const [k] = await tx`select prefix from kelas_entri where kode = ${kelas}`;
  if (!k) throw new GalatPengguna("Kelas entri tidak dikenal.");
  const kunci = `${k.prefix}-${tahun}`;
  const [n] = await tx`insert into nomor_urut (kunci, nilai) values (${kunci}, 1)
    on conflict (kunci) do update set nilai = nomor_urut.nilai + 1 returning nilai`;
  return `SIMPEL/${k.prefix}/${tahun}/${String(n.nilai).padStart(4, "0")}`;
}

export type PegawaiLengkap = {
  id: string; nip: string | null; nama_lengkap_gelar: string; nama_tanpa_gelar: string | null; status_pegawai: string | null;
  jenis_pegawai: string | null; kelompok_jabatan: string | null; pangkat: string | null; golongan_ruang: string | null;
  golongan_pangkat: string | null; jabatan_fungsional: string | null; jabatan_tambahan: string | null; unit_kerja: string | null;
  unit_kerja_id: string | null; direktorat_fakultas: string | null; tempat_lahir: string | null; tanggal_lahir: string | null;
  pejabat_penilai_nip: string | null; atasan_pejabat_penilai_nip: string | null; rezim_kode: string | null; email_resmi: string | null;
};

export async function ambilPegawai(id: string, db: Sql = sql): Promise<PegawaiLengkap | null> {
  const [p] = await db`select * from pegawai where id = ${id}`;
  return (p as unknown as PegawaiLengkap) ?? null;
}

/** Salinan beku identitas terperiksa saat kasus dibuat (pangkat/jabatan bisa berubah kelak). */
export function snapshotPegawai(p: PegawaiLengkap) {
  return {
    id: p.id, nip: p.nip, nama_lengkap_gelar: p.nama_lengkap_gelar, nama_tanpa_gelar: p.nama_tanpa_gelar, status_pegawai: p.status_pegawai,
    pangkat: p.pangkat, golongan_ruang: p.golongan_ruang, golongan_pangkat: p.golongan_pangkat,
    jabatan: p.jabatan_tambahan || p.jabatan_fungsional || p.jenis_pegawai, jabatan_fungsional: p.jabatan_fungsional, jabatan_tambahan: p.jabatan_tambahan,
    unit_kerja: p.unit_kerja, direktorat_fakultas: p.direktorat_fakultas, tempat_lahir: p.tempat_lahir, tanggal_lahir: p.tanggal_lahir,
    kelompok_jabatan: p.kelompok_jabatan, dicatat_pada: new Date().toISOString(),
  };
}

/** Rezim pegawai menurut tabel pemetaan_status_pegawai (bisa disunting admin). */
export async function rezimDariStatus(status: string | null, db: Sql = sql): Promise<string | null> {
  if (!status) return null;
  const [r] = await db`select rezim_kode from pemetaan_status_pegawai where lower(status_pegawai) = lower(${status})`;
  return r?.rezim_kode ?? null;
}

/** Apakah unit kerja (atau salah satu induknya) menerima delegasi hukuman ringan. */
export async function unitPunyaDelegasi(unitId: string | null, db: Sql = sql): Promise<boolean> {
  if (!unitId) return false;
  const [r] = await db`
    with recursive naik as (
      select id, induk_id, punya_delegasi_hukdis_ringan from unit_kerja where id = ${unitId}
      union all
      select u.id, u.induk_id, u.punya_delegasi_hukdis_ringan from unit_kerja u join naik n on u.id = n.induk_id
    ) select bool_or(punya_delegasi_hukdis_ringan) as ada from naik`;
  return !!r?.ada;
}

/** Konteks untuk mesin kewenangan (lihat KONTEKS_TERSEDIA di lib/hukdis/kondisi). */
export async function konteksPegawai(p: PegawaiLengkap | null, db: Sql = sql) {
  return {
    terperiksa_pimpinan_unit: !!p?.jabatan_tambahan?.trim(),
    unit_punya_delegasi: await unitPunyaDelegasi(p?.unit_kerja_id ?? null, db),
    status_pegawai: p?.status_pegawai ?? null,
    kelompok_jabatan: p?.kelompok_jabatan ?? null,
    rezim_kode: p?.rezim_kode ?? null,
  };
}

/** Peringkat golongan ruang untuk validasi jenjang anggota Tim Pemeriksa. */
export async function peringkatGolongan(db: Sql = sql) {
  const rows = await db`select kode, urutan from golongan_ruang`;
  return new Map(rows.map((r) => [String(r.kode).toUpperCase(), r.urutan as number]));
}

export async function ringkasEntri(id: string, db: Sql = sql) {
  const [e] = await db`
    select e.*, k.nama as kelas_nama, s.nama as status_nama, s.kelompok as status_kelompok,
      coalesce(p.nama_lengkap_gelar, e.nama_pegawai_bebas) as nama_pegawai, coalesce(p.nip, e.nip_bebas) as nip_pegawai,
      p.status_pegawai, p.unit_kerja as unit_pegawai, r.nama_singkat as regulasi_singkat, rz.nama as rezim_nama,
      th.nama as tingkat_nama, th.kode as tingkat_kode, jh.nama as jenis_nama, uk.nama as unit_nama
    from entri e
    join kelas_entri k on k.kode = e.kelas
    join status_kasus s on s.kode = e.status_kasus
    left join pegawai p on p.id = e.pegawai_id
    left join regulasi r on r.id = e.regulasi_id
    left join rezim rz on rz.kode = e.rezim_kode
    left join tingkat_hukuman th on th.id = e.tingkat_hukuman_dugaan_id
    left join jenis_hukuman jh on jh.id = e.jenis_hukuman_id
    left join unit_kerja uk on uk.id = e.unit_kerja_id
    where e.id = ${id}`;
  return e ?? null;
}
