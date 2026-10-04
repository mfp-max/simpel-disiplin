"use server";

import { revalidatePath } from "next/cache";
import { wajibHak, wajibPengguna } from "@/lib/auth";
import { sql, transaksi } from "@/lib/db";
import { catatAudit } from "@/lib/audit";
import { GalatPengguna, jalankan } from "@/lib/galat";
import { FORMAT_DEFINISI, type DefinisiRegulasi } from "@/lib/regulasi/definisi";
import { eksporDefinisi } from "@/lib/regulasi/simpan";
import {
  buatVersiBaruRegulasi, daftarkanDefinisi, hapusBaris, tambahBaris, ubahBaris, TABEL_KATALOG, type ModeUbah, type TabelKatalog,
} from "@/lib/regulasi/admin";
import { jalankanRegresi, muatKalender, ujiDefinisi, type RingkasRegresi } from "@/lib/regulasi/regresi";
import { jumlahIsi, periksaDefinisi } from "./_skema";

function segarkan(regulasiId?: string | null) {
  revalidatePath("/pengaturan/regulasi");
  if (regulasiId) {
    revalidatePath(`/pengaturan/regulasi/${regulasiId}`);
    revalidatePath(`/pengaturan/regulasi/${regulasiId}/ringkasan`);
  }
}

function tabelSah(t: string): TabelKatalog {
  if (!TABEL_KATALOG.includes(t as TabelKatalog)) throw new GalatPengguna("Tabel tidak dikenal.");
  return t as TabelKatalog;
}

export type HasilSimpanBaris = { id: string; idBaru?: string; catatan: string[]; regresi: RingkasRegresi };

/** Tambah atau ubah satu baris katalog, lalu jalankan ulang seluruh uji regresi peraturan itu. */
export async function simpanBaris(p: {
  tabel: string; regulasiId: string; id?: string | null; data: Record<string, unknown>; alasan: string; mode?: ModeUbah; tanggalVersi?: string | null;
}) {
  return jalankan(async (): Promise<HasilSimpanBaris> => {
    const pelaku = await wajibHak("kelola_pengaturan");
    const tabel = tabelSah(p.tabel);
    const hasil = await transaksi(async (tx) => {
      let id: string;
      let idBaru: string | undefined;
      let catatan: string[] = [];
      let regulasiId = p.regulasiId;
      if (p.id) {
        const h = await ubahBaris(tx, pelaku, { tabel, id: p.id, data: p.data, alasan: p.alasan, mode: p.mode, tanggalVersi: p.tanggalVersi });
        id = h.id;
        idBaru = h.idBaru;
        catatan = h.catatan;
        regulasiId = h.regulasiId;
      } else {
        id = (await tambahBaris(tx, pelaku, { tabel, regulasiId: p.regulasiId, data: p.data, alasan: p.alasan })).id;
      }
      const regresi = await jalankanRegresi(tx, regulasiId);
      return { id, idBaru, catatan, regresi, regulasiId };
    });
    segarkan(hasil.regulasiId);
    return { id: hasil.id, idBaru: hasil.idBaru, catatan: hasil.catatan, regresi: hasil.regresi };
  }, p.mode === "versi_baru" ? "Versi baru tersimpan" : p.mode === "koreksi" ? "Koreksi tersimpan dan tercatat di log audit" : "Tersimpan");
}

export async function hapusBarisAksi(p: { tabel: string; id: string; alasan: string }) {
  return jalankan(async () => {
    const pelaku = await wajibHak("kelola_pengaturan");
    const tabel = tabelSah(p.tabel);
    const hasil = await transaksi(async (tx) => {
      const h = await hapusBaris(tx, pelaku, { tabel, id: p.id, alasan: p.alasan });
      const regresi = await jalankanRegresi(tx, h.regulasiId);
      return { ...h, regresi };
    });
    segarkan(hasil.regulasiId);
    return { regresi: hasil.regresi };
  }, "Dihapus (isi lama tersimpan di log audit)");
}

export async function jalankanRegresiAksi(regulasiId: string) {
  return jalankan(async () => {
    await wajibHak("kelola_pengaturan");
    const r = await transaksi((tx) => jalankanRegresi(tx, regulasiId));
    segarkan(regulasiId);
    return r;
  });
}

export async function buatVersiRegulasiAksi(p: { regulasiId: string; kode: string; berlakuDari: string | null; alasan: string }) {
  return jalankan(async () => {
    const pelaku = await wajibHak("kelola_pengaturan");
    const h = await transaksi(async (tx) => {
      const v = await buatVersiBaruRegulasi(tx, pelaku, p);
      await jalankanRegresi(tx, v.regulasiId);
      return v;
    });
    segarkan(p.regulasiId);
    return h;
  }, "Versi baru peraturan dibuat sebagai draf");
}

/** Wizard langkah 2: memuat isi peraturan lama sebagai titik awal. */
export async function muatDefinisiAksi(regulasiId: string) {
  return jalankan(async () => {
    await wajibHak("kelola_pengaturan");
    return eksporDefinisi(sql, regulasiId);
  });
}

function pastikanDefinisi(def: unknown): DefinisiRegulasi {
  const d = def as DefinisiRegulasi;
  if (!d || typeof d !== "object" || d.format !== FORMAT_DEFINISI || !d.regulasi) {
    throw new GalatPengguna(`Berkas bukan definisi peraturan SIMPEL. Kolom "format" harus bernilai "${FORMAT_DEFINISI}".`);
  }
  return d;
}

export type PratinjauImpor = {
  kode: string; nama_singkat: string; judul: string; kodeSudahAda: string | null;
  jumlah: [string, number][]; galat: string[]; peringatan: string[]; regresi: RingkasRegresi;
};

/** Impor langkah 1: periksa berkas, jalankan uji di memori — belum menyimpan apa pun. */
export async function pratinjauImporAksi(def: unknown) {
  return jalankan(async (): Promise<PratinjauImpor> => {
    await wajibHak("kelola_pengaturan");
    const d = pastikanDefinisi(def);
    const { galat, peringatan } = periksaDefinisi(d);
    const [ada] = await sql`select nama_singkat from regulasi where kode = ${d.regulasi.kode ?? ""}`;
    if (d.regulasi.menggantikan_kode) {
      const [m] = await sql`select 1 from regulasi where kode = ${d.regulasi.menggantikan_kode}`;
      if (!m) peringatan.push(`Peraturan yang digantikan (${d.regulasi.menggantikan_kode}) tidak ada di sistem; tautan akan dilewati.`);
    }
    let regresi: RingkasRegresi = { jumlah: 0, lulus: 0, memburuk: [], hasil: [] };
    if (!galat.length) regresi = ujiDefinisi(d, await muatKalender());
    return {
      kode: d.regulasi.kode, nama_singkat: d.regulasi.nama_singkat, judul: d.regulasi.judul, kodeSudahAda: ada ? (ada.nama_singkat as string) : null,
      jumlah: jumlahIsi(d), galat, peringatan, regresi,
    };
  });
}

async function simpanDefinisiBaru(def: unknown, alasan: string, sumber: "wizard" | "impor", disalinDari?: string | null) {
  const pelaku = await wajibHak("kelola_pengaturan");
  const d = pastikanDefinisi(def);
  const { galat } = periksaDefinisi(d);
  if (galat.length) throw new GalatPengguna(`Definisi belum dapat disimpan: ${galat[0]}`);
  const h = await transaksi(async (tx) => {
    const r = await daftarkanDefinisi(tx, pelaku, d, { alasan, sumber, disalinDari });
    const regresi = await jalankanRegresi(tx, r.regulasiId);
    return { ...r, regresi };
  });
  segarkan(h.regulasiId);
  return h;
}

export async function simpanImporAksi(def: unknown, alasan: string) {
  return jalankan(() => simpanDefinisiBaru(def, alasan, "impor"), "Definisi peraturan berhasil diimpor");
}

export async function simpanWizardAksi(def: unknown, alasan: string, disalinDari: string | null) {
  return jalankan(() => simpanDefinisiBaru(def, alasan, "wizard", disalinDari), "Peraturan baru tersimpan");
}

/** Mencatat pencetakan ringkasan peraturan (dokumentasi hidup). */
export async function catatCetakAksi(regulasiId: string) {
  return jalankan(async () => {
    const p = await wajibPengguna();
    await catatAudit(p, { aksi: "cetak", tabel: "regulasi", record_id: regulasiId, ringkasan: { regulasi_id: regulasiId, halaman: "ringkasan" } });
    return null;
  });
}
