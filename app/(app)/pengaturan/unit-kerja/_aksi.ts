"use server";

import { revalidatePath } from "next/cache";
import { wajibHak } from "@/lib/auth";
import { transaksi } from "@/lib/db";
import { catatAudit, selisih } from "@/lib/audit";
import { GalatPengguna, jalankan } from "@/lib/galat";

export type MasukanUnit = {
  nama: string;
  jenis: string | null;
  jabatan_pimpinan: string | null;
  induk_id: string | null;
  punya_delegasi_hukdis_ringan: boolean;
  aktif: boolean;
  keterangan: string | null;
};

function bersihkan(m: MasukanUnit) {
  const nama = m.nama?.replace(/\s+/g, " ").trim();
  if (!nama) throw new GalatPengguna("Nama unit kerja wajib diisi.");
  if (nama.length > 200) throw new GalatPengguna("Nama unit kerja terlalu panjang.");
  const teks = (v: string | null | undefined) => (v?.trim() ? v.trim().slice(0, 300) : null);
  return {
    nama, jenis: teks(m.jenis), jabatan_pimpinan: teks(m.jabatan_pimpinan), induk_id: m.induk_id || null,
    punya_delegasi_hukdis_ringan: !!m.punya_delegasi_hukdis_ringan, aktif: m.aktif !== false, keterangan: teks(m.keterangan),
  };
}

export async function simpanUnit(id: string | null, m: MasukanUnit) {
  return jalankan(async () => {
    const p = await wajibHak("kelola_pengaturan");
    const d = bersihkan(m);
    return transaksi(async (tx) => {
      const [kembar] = await tx`select id from unit_kerja where lower(nama) = lower(${d.nama}) ${id ? tx`and id <> ${id}` : tx``}`;
      if (kembar) throw new GalatPengguna("Sudah ada unit kerja dengan nama yang sama.");
      if (d.induk_id) {
        const [induk] = await tx`select id from unit_kerja where id = ${d.induk_id}`;
        if (!induk) throw new GalatPengguna("Unit induk tidak ditemukan.");
        if (id) {
          // Cegah lingkaran: induk tidak boleh unit itu sendiri atau turunannya.
          const [lingkar] = await tx`with recursive turun as (
              select id from unit_kerja where id = ${id} union all select u.id from unit_kerja u join turun t on u.induk_id = t.id
            ) select 1 from turun where id = ${d.induk_id}`;
          if (lingkar) throw new GalatPengguna("Unit induk tidak boleh unit ini sendiri atau unit di bawahnya.");
        }
      }
      if (id) {
        const [lama] = await tx`select nama, jenis, jabatan_pimpinan, induk_id, punya_delegasi_hukdis_ringan, aktif, keterangan from unit_kerja where id = ${id} for update`;
        if (!lama) throw new GalatPengguna("Unit kerja tidak ditemukan.");
        const beda = selisih(lama, d);
        if (!Object.keys(beda).length) throw new GalatPengguna("Tidak ada perubahan.");
        await tx`update unit_kerja set ${tx({ ...d, updated_by: p.id })} where id = ${id}`;
        await catatAudit(p, { aksi: "ubah", tabel: "unit_kerja", record_id: id, ringkasan: { unit: d.nama, ...beda } }, tx);
        return { id };
      }
      const [r] = await tx`insert into unit_kerja ${tx({ ...d, created_by: p.id, updated_by: p.id })} returning id`;
      await catatAudit(p, { aksi: "buat", tabel: "unit_kerja", record_id: r.id, ringkasan: d }, tx);
      return { id: r.id as string };
    });
  }, "Unit kerja tersimpan").finally(() => revalidatePath("/pengaturan/unit-kerja"));
}
