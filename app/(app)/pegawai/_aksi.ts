"use server";

import { revalidatePath } from "next/cache";
import { wajibHak } from "@/lib/auth";
import { transaksi } from "@/lib/db";
import { catatAudit } from "@/lib/audit";
import { GalatPengguna, jalankan } from "@/lib/galat";
import { KODE_FIELD, kunciNamaLahir, normalisasiBaris, type BarisSumber } from "@/lib/simpega/normalisasi";

export type Keaktifan = { aktif: boolean; tanggalKeluar?: string | null; alasanKeluar?: string | null };

/**
 * Menambah pegawai secara manual — untuk pegawai yang tidak ada di rekap Simpega,
 * mis. sudah pensiun/berhenti sebelum SIMPEL dipakai, atau belum masuk Simpega.
 * Bila kelak pegawai yang sama muncul di impor (NIP sama), impor memperbarui datanya.
 */
export async function tambahPegawai(masukan: Record<string, string | null>, k: Keaktifan) {
  return jalankan(async () => {
    const p = await wajibHak("kelola_pengaturan");
    const mentah: BarisSumber = {};
    for (const [kode, v] of Object.entries(masukan ?? {})) {
      if (!KODE_FIELD.has(kode)) throw new GalatPengguna("Ada isian yang tidak dikenal.");
      if (v !== null && v !== "") mentah[kode as keyof BarisSumber] = v;
    }
    const n = normalisasiBaris({ nama_lengkap_gelar: null, ...mentah });
    if (n.galat.length) throw new GalatPengguna(n.galat.join("; ").replace(/^./, (c) => c.toUpperCase()) + ".");
    if (!k.aktif && k.tanggalKeluar && !/^\d{4}-\d{2}-\d{2}$/.test(k.tanggalKeluar)) throw new GalatPengguna("Format tanggal keluar tidak valid.");
    const data = { ...n.data, ...(!k.aktif && k.tanggalKeluar ? { tanggal_keluar: k.tanggalKeluar } : {}) };

    const id = await transaksi(async (tx) => {
      if (data.nip) {
        const [ada] = await tx`select id, nama_lengkap_gelar from pegawai where nip = ${data.nip} or nip_lama = ${data.nip} limit 1`;
        if (ada) throw new GalatPengguna(`NIP ini sudah terdaftar atas nama ${ada.nama_lengkap_gelar}. Buka data pegawai tersebut dari daftar Pegawai.`);
      } else if (data.tanggal_lahir) {
        const kunci = kunciNamaLahir(data.nama_lengkap_gelar, data.tanggal_lahir);
        const kembar = await tx`select id from pegawai where tanggal_lahir = ${data.tanggal_lahir}
          and lower(regexp_replace(trim(nama_lengkap_gelar), '[[:space:]]+', ' ', 'g')) = ${kunci?.split("|")[0] ?? ""} limit 1`;
        if (kembar.length) throw new GalatPengguna("Pegawai dengan nama dan tanggal lahir yang sama sudah ada di daftar Pegawai.");
      }
      const [r] = data.status_pegawai
        ? await tx`select rezim_kode from pemetaan_status_pegawai where lower(status_pegawai) = lower(${data.status_pegawai})`
        : [];
      const [row] = await tx`insert into pegawai ${tx({
        ...data,
        rezim_kode: r?.rezim_kode ?? null,
        aktif: k.aktif,
        sumber: "manual",
        data_tambahan: tx.json(!k.aktif && k.alasanKeluar ? { alasan_keluar: k.alasanKeluar } : {}),
        created_by: p.id,
        updated_by: p.id,
      } as never)} returning id`;
      await catatAudit(p, {
        aksi: "buat", tabel: "pegawai", record_id: row.id,
        ringkasan: { sumber: "manual", nama: data.nama_lengkap_gelar, nip: data.nip ?? null, aktif: k.aktif, alasan_keluar: k.alasanKeluar ?? null },
      }, tx);
      return row.id as string;
    });
    revalidatePath("/pegawai");
    return id;
  }, "Pegawai ditambahkan");
}
