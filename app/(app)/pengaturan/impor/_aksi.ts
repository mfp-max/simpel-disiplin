"use server";

import { revalidatePath } from "next/cache";
import { wajibHak } from "@/lib/auth";
import { sql } from "@/lib/db";
import { catatAudit, selisih } from "@/lib/audit";
import { GalatPengguna, jalankan } from "@/lib/galat";
import { adalahField } from "@/lib/simpega/normalisasi";
import {
  mulaiRiwayat, periksaBaris, periksaKolom, prosesBatch, ringkasanAudit, selesaikanRiwayat, tambahHasilRiwayat,
  type KolomMasuk,
} from "@/lib/simpega/impor";

/** Simulasi satu batch (tidak menulis apa pun) untuk layar konfirmasi. */
export async function pratinjauBatch(kolom: KolomMasuk[], baris: unknown) {
  return jalankan(async () => {
    await wajibHak("kelola_pengaturan");
    const sah = periksaKolom(kolom);
    return prosesBatch(periksaBaris(baris, sah), { sumber: "impor_excel", simulasi: true });
  });
}

export async function mulaiImpor(m: { namaFile: string | null; profilId: string | null; jumlahBaris: number; kolom: KolomMasuk[] }) {
  return jalankan(async () => {
    const p = await wajibHak("kelola_pengaturan");
    if (!Number.isInteger(m.jumlahBaris) || m.jumlahBaris < 1) throw new GalatPengguna("Berkas tidak berisi baris data.");
    if (m.profilId) {
      const [ada] = await sql`select id from profil_impor where id = ${m.profilId}`;
      if (!ada) m.profilId = null;
    }
    const id = await mulaiRiwayat({ ...m, sumber: "impor_excel", penggunaId: p.id });
    return { id };
  });
}

async function riwayatMilik(id: string, penggunaId: string) {
  const [r] = await sql`select id, created_by, coalesce((rincian_tolak->>'selesai')::boolean, false) as selesai from riwayat_impor where id = ${id}`;
  if (!r || r.created_by !== penggunaId) throw new GalatPengguna("Sesi impor tidak ditemukan. Mulai ulang impor.");
  if (r.selesai) throw new GalatPengguna("Impor ini sudah selesai. Mulai impor baru.");
}

export async function jalankanBatch(riwayatId: string, kolom: KolomMasuk[], baris: unknown) {
  return jalankan(async () => {
    const p = await wajibHak("kelola_pengaturan");
    const sah = periksaKolom(kolom);
    const data = periksaBaris(baris, sah);
    await riwayatMilik(riwayatId, p.id);
    const h = await prosesBatch(data, { sumber: "impor_excel", penggunaId: p.id });
    await tambahHasilRiwayat(riwayatId, h);
    return h;
  });
}

export async function selesaikanImpor(riwayatId: string) {
  return jalankan(async () => {
    const p = await wajibHak("kelola_pengaturan");
    await riwayatMilik(riwayatId, p.id);
    const r = await selesaikanRiwayat(riwayatId);
    await catatAudit(p, { aksi: "impor", tabel: "pegawai", record_id: r.id, ringkasan: ringkasanAudit(r) });
    revalidatePath("/pegawai");
    revalidatePath("/pengaturan/impor");
    return { baru: r.jumlah_baru, diperbarui: r.jumlah_diperbarui, ditolak: r.jumlah_ditolak };
  }, "Impor selesai");
}

/** Menyimpan profil pemetaan { "<indeks>": "<field>" }. Hanya field dalam daftar putih. */
export async function simpanProfil(m: { id?: string | null; nama: string; pemetaan: Record<string, string | null>; keterangan?: string | null }) {
  return jalankan(async () => {
    const p = await wajibHak("kelola_pengaturan");
    const nama = m.nama?.trim();
    if (!nama) throw new GalatPengguna("Nama profil wajib diisi.");
    if (nama.length > 120) throw new GalatPengguna("Nama profil terlalu panjang.");
    const pemetaan: Record<string, string> = {};
    const terpakai = new Set<string>();
    for (const [k, f] of Object.entries(m.pemetaan ?? {})) {
      if (!f) continue;
      if (!/^\d{1,3}$/.test(k) || !adalahField(f)) throw new GalatPengguna("Pemetaan berisi isian yang tidak diizinkan.");
      if (terpakai.has(f)) throw new GalatPengguna("Satu isian tujuan hanya boleh dipetakan dari satu kolom.");
      terpakai.add(f);
      pemetaan[k] = f;
    }
    if (!Object.keys(pemetaan).length) throw new GalatPengguna("Belum ada kolom yang dipetakan.");

    if (m.id) {
      const [lama] = await sql`select nama, pemetaan from profil_impor where id = ${m.id}`;
      if (!lama) throw new GalatPengguna("Profil tidak ditemukan.");
      await sql`update profil_impor set nama = ${nama}, pemetaan = ${sql.json(pemetaan)}, keterangan = ${m.keterangan ?? null}, updated_by = ${p.id} where id = ${m.id}`;
      await catatAudit(p, { aksi: "ubah", tabel: "profil_impor", record_id: m.id, ringkasan: selisih(lama, { nama, pemetaan }) });
      revalidatePath("/pengaturan/impor");
      return { id: m.id };
    }
    const [r] = await sql`insert into profil_impor (nama, pemetaan, keterangan, created_by, updated_by)
      values (${nama}, ${sql.json(pemetaan)}, ${m.keterangan ?? null}, ${p.id}, ${p.id}) returning id`;
    await catatAudit(p, { aksi: "buat", tabel: "profil_impor", record_id: r.id, ringkasan: { nama, jumlah_kolom: Object.keys(pemetaan).length } });
    revalidatePath("/pengaturan/impor");
    return { id: r.id as string };
  }, "Profil pemetaan tersimpan");
}
