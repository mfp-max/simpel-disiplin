"use server";

import { revalidatePath } from "next/cache";
import { wajibHak } from "@/lib/auth";
import { sql, transaksi } from "@/lib/db";
import { catatAudit, selisih } from "@/lib/audit";
import { GalatPengguna, jalankan } from "@/lib/galat";
import {
  FIELD_PEGAWAI, KODE_FIELD, LABEL_FIELD, normalisasiBaris, type BarisSumber,
} from "@/lib/simpega/normalisasi";

/** Field yang boleh disunting manual dari halaman detail (= daftar putih impor). */
const FIELD_SUNTING = new Set<string>(FIELD_PEGAWAI.map((f) => f.kode));

/**
 * Menyunting identitas pegawai. Setiap field yang berubah ditandai di field_manual
 * sehingga impor berikutnya tidak menimpanya.
 */
export async function ubahPegawai(id: string, masukan: Record<string, string | null>) {
  return jalankan(async () => {
    const p = await wajibHak("kelola_pengaturan");
    const mentah: BarisSumber = {};
    for (const [k, v] of Object.entries(masukan ?? {})) {
      if (!FIELD_SUNTING.has(k) || !KODE_FIELD.has(k)) throw new GalatPengguna("Ada isian yang tidak boleh disunting.");
      mentah[k as keyof BarisSumber] = v;
    }
    const n = normalisasiBaris(mentah);
    if (n.galat.length) throw new GalatPengguna(n.galat.join("; ").replace(/^./, (c) => c.toUpperCase()) + ".");
    if ("nama_lengkap_gelar" in n.data && !n.data.nama_lengkap_gelar) throw new GalatPengguna("Nama lengkap wajib diisi.");

    await transaksi(async (tx) => {
      const [lama] = await tx`select * from pegawai where id = ${id} for update`;
      if (!lama) throw new GalatPengguna("Pegawai tidak ditemukan.");
      const baru: Record<string, string | null> = {};
      const berubah: string[] = [];
      for (const [k, v] of Object.entries(n.data)) {
        if ((lama[k] ?? null) !== (v ?? null)) {
          baru[k] = v ?? null;
          if (FIELD_SUNTING.has(k)) berubah.push(k);
        }
      }
      if (!Object.keys(baru).length) throw new GalatPengguna("Tidak ada perubahan.");
      if (baru.nip) {
        const [ada] = await tx`select id from pegawai where nip = ${baru.nip} and id <> ${id}`;
        if (ada) throw new GalatPengguna("NIP ini sudah dipakai pegawai lain.");
      }
      const manual = [...new Set([...(lama.field_manual ?? []), ...berubah])];
      const set: Record<string, unknown> = { ...baru, field_manual: manual, updated_by: p.id };
      // Rezim ikut status pegawai bila tidak di-set manual
      if ("status_pegawai" in baru && !lama.rezim_manual) {
        const [r] = baru.status_pegawai
          ? await tx`select rezim_kode from pemetaan_status_pegawai where lower(status_pegawai) = lower(${baru.status_pegawai})`
          : [];
        set.rezim_kode = r?.rezim_kode ?? null;
      }
      await tx`update pegawai set ${tx(set)} where id = ${id}`;
      await catatAudit(p, {
        aksi: "ubah", tabel: "pegawai", record_id: id,
        ringkasan: { ...selisih(lama, baru), field_manual_ditambah: berubah.map((f) => LABEL_FIELD[f] ?? f) },
      }, tx);
    });
    revalidatePath(`/pegawai/${id}`);
  }, "Data pegawai tersimpan. Isian yang diubah tidak akan ditimpa impor berikutnya.");
}

/** Melepas tanda "disunting manual" agar impor berikutnya kembali memperbarui field tersebut. */
export async function lepasFieldManual(id: string, field: string, alasan: string) {
  return jalankan(async () => {
    const p = await wajibHak("kelola_pengaturan");
    if (!alasan?.trim()) throw new GalatPengguna("Alasan wajib diisi.");
    const [r] = await sql`update pegawai set field_manual = array_remove(field_manual, ${field}), updated_by = ${p.id}
      where id = ${id} and ${field} = any(field_manual) returning id`;
    if (!r) throw new GalatPengguna("Isian ini tidak bertanda disunting manual.");
    await catatAudit(p, { aksi: "ubah", tabel: "pegawai", record_id: id, ringkasan: { field_manual_dilepas: LABEL_FIELD[field] ?? field }, alasan: alasan.trim() });
    revalidatePath(`/pegawai/${id}`);
  }, "Tanda suntingan manual dilepas. Impor berikutnya akan memperbarui isian ini.");
}

/**
 * Mengganti rezim secara manual (rezim_manual = true), atau kembali mengikuti
 * tabel pemetaan status pegawai (nilai "ikuti").
 */
export async function ubahRezim(id: string, rezim: string, alasan: string) {
  return jalankan(async () => {
    const p = await wajibHak("kelola_pengaturan");
    if (!alasan?.trim() || alasan.trim().length < 5) throw new GalatPengguna("Alasan wajib diisi (minimal 5 huruf).");
    await transaksi(async (tx) => {
      const [lama] = await tx`select rezim_kode, rezim_manual, status_pegawai from pegawai where id = ${id} for update`;
      if (!lama) throw new GalatPengguna("Pegawai tidak ditemukan.");
      let baru: { rezim_kode: string | null; rezim_manual: boolean };
      if (rezim === "ikuti") {
        const [m] = lama.status_pegawai
          ? await tx`select rezim_kode from pemetaan_status_pegawai where lower(status_pegawai) = lower(${lama.status_pegawai})`
          : [];
        baru = { rezim_kode: m?.rezim_kode ?? null, rezim_manual: false };
      } else if (rezim === "verifikasi") {
        baru = { rezim_kode: null, rezim_manual: true };
      } else {
        const [r] = await tx`select kode from rezim where kode = ${rezim} and aktif`;
        if (!r) throw new GalatPengguna("Rezim tidak dikenal.");
        baru = { rezim_kode: r.kode, rezim_manual: true };
      }
      await tx`update pegawai set rezim_kode = ${baru.rezim_kode}, rezim_manual = ${baru.rezim_manual}, updated_by = ${p.id} where id = ${id}`;
      await catatAudit(p, { aksi: "ubah", tabel: "pegawai", record_id: id, ringkasan: selisih(lama, baru), alasan: alasan.trim() }, tx);
    });
    revalidatePath(`/pegawai/${id}`);
  }, "Rezim pegawai diperbarui");
}

export type IsiKehadiran = { bulan: number; jumlah_hari: number | null; berturut_maks: number | null };

/** Menyimpan catatan TMK (tidak masuk kerja) 12 bulan untuk satu tahun. */
export async function simpanKehadiran(pegawaiId: string, tahun: number, isi: IsiKehadiran[]) {
  return jalankan(async () => {
    const p = await wajibHak("boleh_ubah");
    if (!Number.isInteger(tahun) || tahun < 1990 || tahun > 2100) throw new GalatPengguna("Tahun tidak valid.");
    if (!Array.isArray(isi) || isi.length > 12) throw new GalatPengguna("Data kehadiran tidak valid.");
    const rows = isi.map((r) => {
      const bulan = Number(r.bulan);
      const hari = r.jumlah_hari === null || r.jumlah_hari === undefined ? 0 : Number(r.jumlah_hari);
      const bert = r.berturut_maks === null || r.berturut_maks === undefined ? null : Number(r.berturut_maks);
      if (!Number.isInteger(bulan) || bulan < 1 || bulan > 12) throw new GalatPengguna("Bulan tidak valid.");
      if (!Number.isInteger(hari) || hari < 0 || hari > 31) throw new GalatPengguna(`Jumlah hari bulan ke-${bulan} harus angka 0–31.`);
      if (bert !== null && (!Number.isInteger(bert) || bert < 0 || bert > hari)) throw new GalatPengguna(`Hari berturut-turut bulan ke-${bulan} tidak boleh melebihi jumlah harinya.`);
      return { pegawai_id: pegawaiId, tahun, bulan, jumlah_hari: hari, berturut_maks: bert, sumber: "manual", created_by: p.id, updated_by: p.id };
    });
    await transaksi(async (tx) => {
      const [pg] = await tx`select id from pegawai where id = ${pegawaiId}`;
      if (!pg) throw new GalatPengguna("Pegawai tidak ditemukan.");
      const lama = await tx`select bulan, jumlah_hari, berturut_maks from catatan_kehadiran where pegawai_id = ${pegawaiId} and tahun = ${tahun}`;
      if (rows.length) {
        await tx`insert into catatan_kehadiran ${tx(rows)}
          on conflict (pegawai_id, tahun, bulan) do update set jumlah_hari = excluded.jumlah_hari, berturut_maks = excluded.berturut_maks,
            sumber = excluded.sumber, updated_by = excluded.updated_by, updated_at = now()`;
      }
      const peta = (xs: { bulan: number; jumlah_hari: number; berturut_maks: number | null }[]) =>
        Object.fromEntries(xs.map((x) => [String(x.bulan), [x.jumlah_hari, x.berturut_maks]]));
      await catatAudit(p, {
        aksi: "ubah", tabel: "catatan_kehadiran", record_id: pegawaiId,
        ringkasan: { tahun, ...selisih(peta(lama as never), peta(rows)) },
      }, tx);
    });
    revalidatePath(`/pegawai/${pegawaiId}`);
  }, "Catatan kehadiran tersimpan");
}
