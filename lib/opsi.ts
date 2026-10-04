import "server-only";
import { sql } from "@/lib/db";
import type { OpsiRegulasi } from "@/components/simpel/form-entri";

/** Peraturan dasar kasus (utama) beserta jenis hukumannya — untuk formulir arsip & kasus. */
export async function opsiRegulasiUtama(): Promise<OpsiRegulasi[]> {
  const [reg, jenis] = await Promise.all([
    sql`select id, nama_singkat, rezim_kode, berlaku_dari, berlaku_sampai from regulasi where utama and status <> 'draf' order by rezim_kode, berlaku_dari`,
    sql`select j.id, j.nama, j.regulasi_id, t.nama as tingkat from jenis_hukuman j join tingkat_hukuman t on t.id = j.tingkat_hukuman_id
        where j.aktif order by t.urutan, j.urutan`,
  ]);
  return reg.map((r) => ({
    id: r.id, nama_singkat: r.nama_singkat, rezim_kode: r.rezim_kode, berlaku_dari: r.berlaku_dari, berlaku_sampai: r.berlaku_sampai,
    jenis: jenis.filter((j) => j.regulasi_id === r.id).map((j) => ({ id: j.id, nama: j.nama, tingkat: j.tingkat })),
  }));
}
