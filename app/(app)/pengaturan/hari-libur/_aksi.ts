"use server";

import { revalidatePath } from "next/cache";
import { wajibHak } from "@/lib/auth";
import { sql, transaksi } from "@/lib/db";
import { catatAudit, selisih } from "@/lib/audit";
import { GalatPengguna, jalankan } from "@/lib/galat";

export type IsianLibur = { tanggal: string; nama: string; jenis: string; keterangan: string };
const JENIS = ["libur_nasional", "cuti_bersama"];

function tanggalSah(t: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(t)) return false;
  const [y, m, d] = t.split("-").map(Number);
  const x = new Date(Date.UTC(y, m - 1, d));
  return x.getUTCFullYear() === y && x.getUTCMonth() === m - 1 && x.getUTCDate() === d && y >= 2000 && y <= 2100;
}

function rapikan(x: IsianLibur) {
  const tanggal = x.tanggal.trim();
  const nama = x.nama.trim();
  if (!tanggalSah(tanggal)) throw new GalatPengguna("Tanggal tidak valid.");
  if (nama.length < 3) throw new GalatPengguna("Nama hari libur minimal 3 huruf.");
  if (!JENIS.includes(x.jenis)) throw new GalatPengguna("Pilih jenis: libur nasional atau cuti bersama.");
  return { tanggal, nama, jenis: x.jenis, keterangan: x.keterangan.trim() || null };
}

function segarkan() {
  revalidatePath("/pengaturan/hari-libur");
}

export async function simpanLibur(id: string | null, isian: IsianLibur) {
  return jalankan(async () => {
    const p = await wajibHak("kelola_pengaturan");
    const d = rapikan(isian);
    const [bentrok] = await sql`select id, nama from hari_libur where tanggal = ${d.tanggal} and (${id}::uuid is null or id <> ${id}::uuid)`;
    if (bentrok) throw new GalatPengguna(`Tanggal ini sudah tercatat sebagai "${bentrok.nama}". Ubah baris tersebut saja.`);
    await transaksi(async (tx) => {
      if (id) {
        const [lama] = await tx`select tanggal, nama, jenis, keterangan from hari_libur where id = ${id}`;
        if (!lama) throw new GalatPengguna("Data hari libur tidak ditemukan.");
        await tx`update hari_libur set ${tx(d)}, updated_by = ${p.id} where id = ${id}`;
        await catatAudit(p, { aksi: "ubah", tabel: "hari_libur", record_id: id, ringkasan: selisih(lama, d) }, tx);
      } else {
        const [r] = await tx`insert into hari_libur ${tx({ ...d, created_by: p.id, updated_by: p.id })} returning id`;
        await catatAudit(p, { aksi: "buat", tabel: "hari_libur", record_id: r.id, ringkasan: d }, tx);
      }
    });
    segarkan();
  }, id ? "Hari libur diperbarui" : "Hari libur ditambahkan");
}

export async function hapusLibur(id: string) {
  return jalankan(async () => {
    const p = await wajibHak("kelola_pengaturan");
    await transaksi(async (tx) => {
      const [lama] = await tx`delete from hari_libur where id = ${id} returning tanggal, nama, jenis, keterangan`;
      if (!lama) throw new GalatPengguna("Data hari libur tidak ditemukan.");
      await catatAudit(p, { aksi: "hapus", tabel: "hari_libur", record_id: id, ringkasan: { ...lama } }, tx);
    });
    segarkan();
  }, "Hari libur dihapus");
}

/** Tambah banyak sekaligus. Tanggal yang sudah ada dilewati, kecuali `timpa` = true. */
export async function tempelLibur(baris: IsianLibur[], timpa: boolean) {
  return jalankan(async () => {
    const p = await wajibHak("kelola_pengaturan");
    if (!baris.length) throw new GalatPengguna("Tidak ada baris yang dapat disimpan.");
    if (baris.length > 400) throw new GalatPengguna("Maksimal 400 baris sekali tempel.");
    const data = baris.map(rapikan);
    const unik = new Map(data.map((d) => [d.tanggal, d]));
    let baru = 0, diperbarui = 0, dilewati = 0;
    await transaksi(async (tx) => {
      const ada = new Map((await tx`select id, tanggal, nama, jenis, keterangan from hari_libur where tanggal in ${tx([...unik.keys()])}`).map((r) => [r.tanggal as string, r]));
      for (const d of unik.values()) {
        const lama = ada.get(d.tanggal);
        if (!lama) {
          await tx`insert into hari_libur ${tx({ ...d, created_by: p.id, updated_by: p.id })}`;
          baru += 1;
        } else if (timpa) {
          await tx`update hari_libur set ${tx(d)}, updated_by = ${p.id} where id = ${lama.id}`;
          diperbarui += 1;
        } else {
          dilewati += 1;
        }
      }
      await catatAudit(p, {
        aksi: "impor", tabel: "hari_libur",
        ringkasan: { baru, diperbarui, dilewati, tanggal: [...unik.keys()].sort() },
      }, tx);
    });
    segarkan();
    return { baru, diperbarui, dilewati };
  });
}
