import { JudulHalaman } from "@/components/simpel/dasar";
import { wajibHalamanHak } from "@/lib/auth";
import { sql } from "@/lib/db";
import { referensi } from "@/lib/pengaturan";
import { WizardKasus } from "./wizard";

export const metadata = { title: "Kasus baru" };

export default async function KasusBaru({ searchParams }: { searchParams: Promise<{ dari?: string; pegawai?: string }> }) {
  await wajibHalamanHak("boleh_buat");
  const { dari, pegawai } = await searchParams;
  const [regulasi, sumber, dampak] = await Promise.all([
    sql`select id, nama_singkat, rezim_kode, berlaku_dari, berlaku_sampai from regulasi where utama and status <> 'draf' order by rezim_kode, berlaku_dari`,
    referensi("sumber_informasi"),
    referensi("dampak"),
  ]);

  let awal: Record<string, unknown> | null = null;
  const kolomPg = sql`pg.id as pid, pg.nip, pg.nama_lengkap_gelar, pg.unit_kerja, pg.status_pegawai, pg.golongan_ruang, coalesce(nullif(pg.jabatan_tambahan,''), pg.jabatan_fungsional) as jabatan, pg.rezim_kode`;
  if (dari) {
    const [inf] = await sql`select e.id, e.judul, e.ringkasan, e.tanggal_peristiwa, e.sumber_informasi, e.pelapor_nama, e.pelapor_kontak, ${kolomPg}
      from entri e left join pegawai pg on pg.id = e.pegawai_id where e.id = ${dari} and e.kelas = 'informasi'`;
    if (inf) awal = { berasalDariId: inf.id, judul: inf.judul, ringkasan: inf.ringkasan, tanggalPeristiwa: inf.tanggal_peristiwa, sumberInformasi: inf.sumber_informasi, pelaporNama: inf.pelapor_nama, pelaporKontak: inf.pelapor_kontak, pegawai: inf.pid ? { id: inf.pid, nip: inf.nip, nama_lengkap_gelar: inf.nama_lengkap_gelar, unit_kerja: inf.unit_kerja, status_pegawai: inf.status_pegawai, golongan_ruang: inf.golongan_ruang, jabatan: inf.jabatan, rezim_kode: inf.rezim_kode } : null };
  } else if (pegawai) {
    const [pg] = await sql`select ${kolomPg} from pegawai pg where pg.id = ${pegawai}`;
    if (pg) awal = { pegawai: { id: pg.pid, nip: pg.nip, nama_lengkap_gelar: pg.nama_lengkap_gelar, unit_kerja: pg.unit_kerja, status_pegawai: pg.status_pegawai, golongan_ruang: pg.golongan_ruang, jabatan: pg.jabatan, rezim_kode: pg.rezim_kode } };
  }

  return (
    <div className="mx-auto max-w-4xl">
      <JudulHalaman
        judul="Kasus hukuman disiplin baru"
        deskripsi="Empat langkah singkat. Peraturan dipilih otomatis menurut tanggal peristiwa dan status pegawai."
        kembali={dari ? { href: `/informasi/${dari}`, label: "Kembali ke informasi" } : { href: "/kasus", label: "Kasus Hukdis" }}
      />
      <WizardKasus
        awal={awal as never}
        regulasi={regulasi.map((r) => ({ id: r.id, nama_singkat: r.nama_singkat, rezim_kode: r.rezim_kode, berlaku_dari: r.berlaku_dari, berlaku_sampai: r.berlaku_sampai }))}
        sumber={sumber.map((s) => ({ kode: s.kode, label: s.label }))}
        dampak={dampak.map((s) => ({ kode: s.kode, label: s.label }))}
      />
    </div>
  );
}
