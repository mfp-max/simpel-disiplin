"use server";

import { revalidatePath } from "next/cache";
import { wajibHak } from "@/lib/auth";
import { transaksi } from "@/lib/db";
import { catatAudit, selisih } from "@/lib/audit";
import { GalatPengguna, jalankan } from "@/lib/galat";
import { ambilPegawai, nomorRegistrasi, rezimDariStatus, snapshotPegawai } from "@/lib/entri";
import { ambilRegulasi, snapshotRegulasi } from "@/lib/regulasi";

export type MasukanEntriSederhana = {
  kelas: "informasi" | "non_hukdis" | "arsip";
  judul: string;
  ringkasan?: string | null;
  tanggalPeristiwa?: string | null;
  tahunPeristiwa?: number | null;
  pegawaiId?: string | null;
  namaPegawaiBebas?: string | null;
  nipBebas?: string | null;
  unitKerjaBebas?: string | null;
  sumberInformasi?: string | null;
  pelaporNama?: string | null;
  pelaporKontak?: string | null;
  jenisNonHukdis?: string | null;
  regulasiId?: string | null;
  kelengkapanBerkas?: string | null;
  catatanInternal?: string | null;
  berasalDariId?: string | null;
  // khusus arsip: hukuman lampau
  jenisHukumanId?: string | null;
  jenisHukumanBebas?: string | null;
  pasalTeksBebas?: string | null;
  nomorSk?: string | null;
  tanggalSk?: string | null;
};

const STATUS_AWAL = { informasi: "informasi", non_hukdis: "tercatat", arsip: "selesai" } as const;

/** Membuat entri informasi / pembinaan / arsip. */
export async function buatEntriSederhana(m: MasukanEntriSederhana) {
  return jalankan(async () => {
    const p = await wajibHak("boleh_buat");
    if (!m.judul?.trim()) throw new GalatPengguna(m.kelas === "arsip" ? "Uraian singkat wajib diisi." : "Judul wajib diisi.");
    if (m.kelas === "arsip") {
      if (!m.pegawaiId && !m.namaPegawaiBebas?.trim()) throw new GalatPengguna("Nama pegawai wajib diisi.");
      if (!m.tahunPeristiwa && !m.tanggalPeristiwa) throw new GalatPengguna("Tahun kejadian wajib diisi.");
    }
    if (m.kelas === "non_hukdis" && !m.pegawaiId && !m.namaPegawaiBebas?.trim()) throw new GalatPengguna("Pegawai wajib dipilih.");

    const pegawai = m.pegawaiId ? await ambilPegawai(m.pegawaiId) : null;
    const tahun = m.tahunPeristiwa ?? (m.tanggalPeristiwa ? Number(m.tanggalPeristiwa.slice(0, 4)) : null);
    const regulasi = m.regulasiId ? await ambilRegulasi(m.regulasiId) : null;
    const rezim = regulasi?.rezim_kode ?? pegawai?.rezim_kode ?? (pegawai ? await rezimDariStatus(pegawai.status_pegawai) : null);

    const id = await transaksi(async (tx) => {
      const nomor = await nomorRegistrasi(tx, m.kelas, new Date().getFullYear());
      const [e] = await tx`insert into entri (nomor_registrasi, kelas, judul, ringkasan, tanggal_peristiwa, tahun_peristiwa, pegawai_id,
          nama_pegawai_bebas, nip_bebas, unit_kerja_id, unit_kerja_bebas, snapshot_pegawai, regulasi_id, rezim_kode, snapshot_regulasi,
          status_kasus, sumber_informasi, pelapor_nama, pelapor_kontak, hitung_dalam_sla, kelengkapan_berkas, jenis_non_hukdis,
          catatan_internal, berasal_dari_id, tanggal_selesai, pic_user_id, created_by, updated_by)
        values (${nomor}, ${m.kelas}, ${m.judul.trim()}, ${m.ringkasan ?? null}, ${m.tanggalPeristiwa || null}, ${tahun}, ${pegawai?.id ?? null},
          ${pegawai ? null : m.namaPegawaiBebas?.trim() || null}, ${pegawai ? null : m.nipBebas?.trim() || null}, ${pegawai?.unit_kerja_id ?? null},
          ${m.unitKerjaBebas ?? null}, ${pegawai ? tx.json(snapshotPegawai(pegawai) as never) : null}, ${regulasi?.id ?? null}, ${rezim},
          ${regulasi ? tx.json(snapshotRegulasi(regulasi) as never) : null}, ${STATUS_AWAL[m.kelas]}, ${m.sumberInformasi ?? null},
          ${m.pelaporNama ?? null}, ${m.pelaporKontak ?? null}, false, ${m.kelengkapanBerkas ?? null}, ${m.jenisNonHukdis ?? null},
          ${m.catatanInternal ?? null}, ${m.berasalDariId ?? null}, ${m.kelas === "arsip" ? m.tanggalSk || m.tanggalPeristiwa || null : null},
          ${p.id}, ${p.id}, ${p.id})
        returning id`;

      if (m.kelas === "arsip" && (m.jenisHukumanId || m.jenisHukumanBebas || m.pasalTeksBebas || m.nomorSk)) {
        let snapshot: Record<string, unknown> = { nama: m.jenisHukumanBebas || null, regulasi: regulasi?.nama_singkat ?? null, sumber: "arsip", dicatat_pada: new Date().toISOString() };
        if (m.jenisHukumanId) {
          const [j] = await tx`select j.kode, j.nama, j.durasi_bulan, j.regulasi_id, t.nama as tingkat, t.kode as tingkat_kode from jenis_hukuman j
            join tingkat_hukuman t on t.id = j.tingkat_hukuman_id where j.id = ${m.jenisHukumanId}`;
          if (!j || (regulasi && j.regulasi_id !== regulasi.id)) throw new GalatPengguna("Jenis hukuman harus berasal dari peraturan yang dipilih.");
          snapshot = { ...snapshot, kode: j.kode, nama: j.nama, tingkat: j.tingkat, tingkat_kode: j.tingkat_kode, durasi_bulan: j.durasi_bulan };
          await tx`update entri set jenis_hukuman_id = ${m.jenisHukumanId} where id = ${e.id}`;
        }
        await tx`insert into hukuman (entri_id, jenis_hukuman_id, snapshot_jenis_hukuman, nomor_sk, tanggal_sk, catatan, created_by, updated_by)
          values (${e.id}, ${m.jenisHukumanId ?? null}, ${tx.json(snapshot as never)}, ${m.nomorSk ?? null}, ${m.tanggalSk || null},
            ${"Data arsip kasus lampau"}, ${p.id}, ${p.id})`;
      }
      if (m.pasalTeksBebas?.trim()) {
        await tx`insert into pelanggaran_entri (entri_id, pasal_teks_bebas, uraian_perbuatan, urutan, created_by, updated_by)
          values (${e.id}, ${m.pasalTeksBebas.trim()}, ${m.ringkasan ?? null}, 1, ${p.id}, ${p.id})`;
      }
      if (m.berasalDariId) {
        const [asal] = await tx`update entri set status_kasus = 'dinaikkan', dinaikkan_ke_id = ${e.id}, updated_by = ${p.id}
          where id = ${m.berasalDariId} and kelas = 'informasi' and status_kasus = 'informasi' returning id`;
        if (asal) await catatAudit(p, { aksi: "ubah", tabel: "entri", record_id: asal.id, entri_id: asal.id, ringkasan: { ditindaklanjuti_menjadi: nomor } }, tx);
      }
      await catatAudit(p, { aksi: "buat", tabel: "entri", record_id: e.id, entri_id: e.id, ringkasan: { kelas: m.kelas, nomor, judul: m.judul } }, tx);
      return e.id as string;
    });
    revalidatePath("/", "layout");
    return id;
  }, "Tersimpan");
}

const KOLOM_UBAH = [
  "judul", "ringkasan", "tanggal_peristiwa", "tahun_peristiwa", "sumber_informasi", "pelapor_nama", "pelapor_kontak",
  "kelengkapan_berkas", "jenis_non_hukdis", "catatan_internal", "nama_pegawai_bebas", "nip_bebas", "unit_kerja_bebas", "pic_user_id",
] as const;

/** Mengubah kolom ringkas sebuah entri (bukan kolom aturan/snapshot). */
export async function ubahEntri(id: string, data: Partial<Record<(typeof KOLOM_UBAH)[number], string | number | null>>) {
  return jalankan(async () => {
    const p = await wajibHak("boleh_ubah");
    const bersih = Object.fromEntries(Object.entries(data).filter(([k]) => (KOLOM_UBAH as readonly string[]).includes(k)).map(([k, v]) => [k, v === "" ? null : v]));
    if (!Object.keys(bersih).length) return;
    if ("judul" in bersih && !String(bersih.judul ?? "").trim()) throw new GalatPengguna("Judul tidak boleh kosong.");
    await transaksi(async (tx) => {
      const [lama] = await tx`select * from entri where id = ${id} for update`;
      if (!lama) throw new GalatPengguna("Data tidak ditemukan.");
      await tx`update entri set ${tx(bersih as never, ...(Object.keys(bersih) as never[]))}, updated_by = ${p.id} where id = ${id}`;
      await catatAudit(p, { aksi: "ubah", tabel: "entri", record_id: id, entri_id: id, ringkasan: selisih(lama, bersih) }, tx);
    });
    revalidatePath("/", "layout");
  }, "Perubahan tersimpan");
}

/** Mengganti pegawai terlapor (informasi/arsip/pembinaan). Snapshot identitas diperbarui. */
export async function gantiPegawaiEntri(id: string, pegawaiId: string | null) {
  return jalankan(async () => {
    const p = await wajibHak("boleh_ubah");
    const pegawai = pegawaiId ? await ambilPegawai(pegawaiId) : null;
    await transaksi(async (tx) => {
      const [e] = await tx`select kelas, pegawai_id from entri where id = ${id}`;
      if (!e) throw new GalatPengguna("Data tidak ditemukan.");
      if (e.kelas === "hukdis") throw new GalatPengguna("Terperiksa pada kasus hukdis tidak dapat diganti. Hentikan kasus ini dan buat kasus baru.");
      const rezim = pegawai ? pegawai.rezim_kode ?? (await rezimDariStatus(pegawai.status_pegawai, tx)) : null;
      await tx`update entri set pegawai_id = ${pegawai?.id ?? null}, unit_kerja_id = ${pegawai?.unit_kerja_id ?? null},
          snapshot_pegawai = ${pegawai ? tx.json(snapshotPegawai(pegawai) as never) : null}, rezim_kode = coalesce(${rezim}, rezim_kode),
          nama_pegawai_bebas = case when ${pegawai?.id ?? null}::uuid is null then nama_pegawai_bebas else null end, updated_by = ${p.id}
        where id = ${id}`;
      await catatAudit(p, { aksi: "ubah", tabel: "entri", record_id: id, entri_id: id, ringkasan: { pegawai_id: { sebelum: e.pegawai_id, sesudah: pegawai?.id ?? null } } }, tx);
    });
    revalidatePath("/", "layout");
  }, "Pegawai terlapor diperbarui");
}

/** Arsipkan (soft delete) entri dengan alasan — hanya peran berhak arsipkan. */
export async function arsipkanEntri(id: string, alasan: string) {
  return jalankan(async () => {
    const p = await wajibHak("boleh_arsipkan");
    await transaksi(async (tx) => {
      await tx`update entri set diarsipkan_pada = now(), diarsipkan_oleh = ${p.id}, alasan_diarsipkan = ${alasan}, updated_by = ${p.id} where id = ${id}`;
      await catatAudit(p, { aksi: "arsipkan", tabel: "entri", record_id: id, entri_id: id, alasan }, tx);
    });
    revalidatePath("/", "layout");
  }, "Data diarsipkan (tidak dihapus permanen)");
}

export async function pulihkanEntri(id: string, alasan: string) {
  return jalankan(async () => {
    const p = await wajibHak("boleh_arsipkan");
    await transaksi(async (tx) => {
      await tx`update entri set diarsipkan_pada = null, diarsipkan_oleh = null, alasan_diarsipkan = null, updated_by = ${p.id} where id = ${id}`;
      await catatAudit(p, { aksi: "pulihkan", tabel: "entri", record_id: id, entri_id: id, alasan }, tx);
    });
    revalidatePath("/", "layout");
  }, "Data dipulihkan");
}

/** Menutup informasi tanpa tindak lanjut (tetap tersimpan, tidak dihitung). */
export async function tutupInformasi(id: string, alasan: string) {
  return jalankan(async () => {
    const p = await wajibHak("boleh_ubah");
    await transaksi(async (tx) => {
      await tx`update entri set status_kasus = 'tercatat', catatan_internal = trim(both from coalesce(catatan_internal, '') || ${"\n[Ditutup tanpa tindak lanjut] " + alasan}),
          updated_by = ${p.id} where id = ${id} and kelas = 'informasi'`;
      await catatAudit(p, { aksi: "ubah", tabel: "entri", record_id: id, entri_id: id, alasan, ringkasan: { status_kasus: "tercatat" } }, tx);
    });
    revalidatePath("/", "layout");
  }, "Informasi ditutup");
}
