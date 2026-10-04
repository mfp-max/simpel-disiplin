import "server-only";
import { sql, type Sql } from "@/lib/db";
import { catatAudit } from "@/lib/audit";
import { pengaturan } from "@/lib/pengaturan";
import { hariIni, tambahHariKalender } from "@/lib/hari-kerja";
import { daftarBerkas, hapusBerkas, unduhBerkas, unggahBerkas } from "@/lib/penyimpanan";

// Rekaman audio pemeriksaan (PRD §9.1). Semua berkas di bucket privat:
//   entri/<entri>/sesi/<sesi>/persetujuan-*        surat persetujuan bertanda tangan
//   entri/<entri>/sesi/<sesi>/rekaman/00001.webm   potongan ±10 detik (sementara)
//   entri/<entri>/sesi/<sesi>/rekaman-00042.webm   hasil gabungan potongan 1..42
// Nomor potongan tidak pernah dipakai ulang dan nama hasil gabungan selalu baru,
// sehingga tembolok (CDN) penyimpanan tidak pernah menyajikan isi lama.
// Tidak ada URL publik; pemutaran hanya lewat /api/rekaman/[sesi] (≤ 300 detik, tercatat).

/** Kalimat baku untuk BAP bila terperiksa menolak perekaman (§9.1 butir 3). */
export const CATATAN_PENOLAKAN =
  "Terperiksa menyatakan tidak bersedia pemeriksaan direkam. Pemeriksaan tetap dilaksanakan tanpa rekaman audio. Penolakan ini merupakan hak terperiksa dan tidak menjadi hal yang memberatkan.";

export const RETENSI_BAWAAN_HARI = 90;

export function folderSesi(entriId: string, sesiId: string) {
  return `entri/${entriId}/sesi/${sesiId}`;
}
export function folderPotongan(entriId: string, sesiId: string) {
  return `${folderSesi(entriId, sesiId)}/rekaman`;
}
export function namaPotongan(nomor: number) {
  return `${String(nomor).padStart(5, "0")}.webm`;
}
export function pathRekaman(entriId: string, sesiId: string, sampaiPotongan: number) {
  return `${folderSesi(entriId, sesiId)}/rekaman-${String(sampaiPotongan).padStart(5, "0")}.webm`;
}
/** Nomor potongan terakhir yang sudah tergabung ke rekaman_path (0 bila belum ada). */
export function potonganTergabung(rekamanPath: string | null | undefined) {
  const m = rekamanPath?.match(/rekaman-(\d+)\.webm$/);
  return m ? Number(m[1]) : 0;
}

export type SesiRekam = {
  id: string;
  entri_id: string;
  status: string;
  persetujuan_rekam: boolean;
  persetujuan_ditolak: boolean;
  persetujuan_rekam_file: string | null;
  rekaman_path: string | null;
  rekaman_jumlah_potongan: number;
  rekaman_durasi_detik: number | null;
  rekaman_hapus_pada: string | null;
  rekaman_diperpanjang: boolean;
  rekaman_dihapus_pada: Date | null;
};

export async function muatSesiRekam(sesiId: string, db: Sql = sql): Promise<SesiRekam | null> {
  const [s] = await db`select id, entri_id, status, persetujuan_rekam, persetujuan_ditolak, persetujuan_rekam_file, rekaman_path,
      rekaman_jumlah_potongan, rekaman_durasi_detik, rekaman_hapus_pada, rekaman_diperpanjang, rekaman_dihapus_pada
    from sesi_pemeriksaan where id = ${sesiId}`;
  return (s as unknown as SesiRekam) ?? null;
}

/**
 * Alasan tombol rekam terkunci, atau null bila boleh merekam.
 * Rekam HANYA bila persetujuan dicentang DAN surat persetujuan bertanda tangan sudah diunggah.
 */
export function alasanTerkunci(s: Pick<SesiRekam, "persetujuan_rekam" | "persetujuan_ditolak" | "persetujuan_rekam_file" | "rekaman_dihapus_pada">): string | null {
  if (s.persetujuan_ditolak) return "Terperiksa menolak perekaman. Pemeriksaan berjalan tanpa rekaman.";
  if (s.rekaman_dihapus_pada) return "Rekaman sesi ini sudah dihapus sesuai masa retensi.";
  if (!s.persetujuan_rekam && !s.persetujuan_rekam_file)
    return "Centang persetujuan terperiksa dan unggah surat persetujuan perekaman yang sudah ditandatangani.";
  if (!s.persetujuan_rekam) return "Centang bahwa terperiksa telah menyetujui perekaman.";
  if (!s.persetujuan_rekam_file) return "Unggah dulu surat persetujuan perekaman yang sudah ditandatangani terperiksa.";
  return null;
}

/** Tanggal hapus rekaman = tanggal kasus selesai/dihentikan + retensi (hari kalender). */
export function hitungTanggalHapus(tanggalAkhirKasus: string, retensiHari: number) {
  const n = Number.isFinite(retensiHari) && retensiHari > 0 ? Math.floor(retensiHari) : RETENSI_BAWAAN_HARI;
  return tambahHariKalender(tanggalAkhirKasus.slice(0, 10), n);
}

export async function retensiHari() {
  return Number(await pengaturan<number>("retensi_rekaman_hari", RETENSI_BAWAAN_HARI)) || RETENSI_BAWAAN_HARI;
}

/**
 * Tanggal akhir kasus bila kasus sudah selesai/dihentikan, selain itu null.
 * Memakai entri.tanggal_selesai; bila kosong, tanggal terakhir entri diperbarui (WIB).
 */
export async function tanggalAkhirKasus(entriId: string, db: Sql = sql): Promise<string | null> {
  const [r] = await db`select coalesce(e.tanggal_selesai, (e.updated_at at time zone 'Asia/Jakarta')::date)::text as tgl
    from entri e join status_kasus s on s.kode = e.status_kasus
    where e.id = ${entriId} and s.kelompok in ('selesai', 'dihentikan')`;
  return (r?.tgl as string | undefined) ?? null;
}

/**
 * Menggabungkan potongan nomor `dari`..`sampai` di `folder` (berurutan) menjadi satu berkas `tujuan`.
 * Bila `awal` diisi (rekaman lama), isinya diletakkan di depan lalu berkas lama dihapus.
 * Potongan dihapus setelah berhasil.
 */
export async function gabungkanPotongan(o: { folder: string; dari?: number; sampai: number; tujuan: string; awal?: string | null; mime?: string }) {
  const bagian: Buffer[] = [];
  const hilang: number[] = [];
  if (o.awal) bagian.push(await unduhBerkas(o.awal));
  const dari = Math.max(1, o.dari ?? 1);
  const nomor = Array.from({ length: Math.max(0, o.sampai - dari + 1) }, (_, i) => dari + i);
  for (let i = 0; i < nomor.length; i += 8) {
    const kelompok = nomor.slice(i, i + 8);
    const hasil = await Promise.all(
      kelompok.map(async (n) => {
        try {
          return await unduhBerkas(`${o.folder}/${namaPotongan(n)}`);
        } catch {
          hilang.push(n);
          return null;
        }
      }),
    );
    for (const b of hasil) if (b) bagian.push(b);
  }
  if (!bagian.length) throw new Error("Tidak ada potongan rekaman yang dapat dibaca.");
  const isi = Buffer.concat(bagian);
  await unggahBerkas(o.tujuan, isi, o.mime ?? "audio/webm", true);
  if (o.awal && o.awal !== o.tujuan) await hapusBerkas([o.awal]);
  await hapusPotongan(o.folder);
  return { path: o.tujuan, ukuran: isi.length, hilang: hilang.sort((a, b) => a - b) };
}

/** Menghapus semua berkas di sebuah folder (bertahap, 1000 per putaran). */
export async function hapusPotongan(folder: string) {
  let total = 0;
  for (let putaran = 0; putaran < 50; putaran++) {
    const isi = (await daftarBerkas(folder)).filter((f) => f.id || f.metadata);
    if (!isi.length) break;
    await hapusBerkas(isi.map((f) => `${folder}/${f.name}`));
    total += isi.length;
    if (isi.length < 1000) break;
  }
  return total;
}

/** Menghapus rekaman gabungan + sisa potongan sebuah sesi dari penyimpanan. */
export async function hapusBerkasRekaman(entriId: string, sesiId: string, rekamanPath: string | null) {
  const lama = (await daftarBerkas(folderSesi(entriId, sesiId))).filter((f) => f.id && /^rekaman.*\.webm$/.test(f.name));
  const target = new Set<string>(lama.map((f) => `${folderSesi(entriId, sesiId)}/${f.name}`));
  if (rekamanPath) target.add(rekamanPath);
  if (target.size) await hapusBerkas([...target]);
  const sisa = await hapusPotongan(folderPotongan(entriId, sesiId));
  return { dihapus: target.size, sisaPotongan: sisa };
}

/** Tugas harian retensi (§9.1 butir 5). Dipanggil oleh /api/cron/hapus-rekaman. */
export async function jalankanRetensi(db: Sql = sql, hari?: number) {
  const retensi = hari ?? (await retensiHari());
  const hariIniWib = hariIni();

  // 1) Kasus sudah selesai/dihentikan → tetapkan tanggal hapus untuk sesi yang punya rekaman.
  const ditetapkan = await db`
    with akhir as (
      select s.id, coalesce(e.tanggal_selesai, (e.updated_at at time zone 'Asia/Jakarta')::date) as tgl
      from sesi_pemeriksaan s
      join entri e on e.id = s.entri_id
      join status_kasus sk on sk.kode = e.status_kasus
      where sk.kelompok in ('selesai', 'dihentikan')
        and s.rekaman_hapus_pada is null and s.rekaman_dihapus_pada is null
        and (s.rekaman_path is not null or s.rekaman_jumlah_potongan > 0)
    )
    update sesi_pemeriksaan s set rekaman_hapus_pada = (akhir.tgl + ${retensi}::int)
    from akhir where akhir.id = s.id
    returning s.id, s.entri_id, s.rekaman_hapus_pada`;
  for (const r of ditetapkan) {
    await catatAudit(null, {
      aksi: "ubah", tabel: "sesi_pemeriksaan", record_id: r.id, entri_id: r.entri_id,
      ringkasan: { rekaman_hapus_pada: r.rekaman_hapus_pada, keterangan: `Kasus selesai/dihentikan — rekaman dijadwalkan dihapus (retensi ${retensi} hari)` },
    }, db);
  }

  // 2) Lewat tanggal hapus → hapus berkas, kosongkan path, catat audit.
  const jatuhTempo = await db`select id, entri_id, rekaman_path, rekaman_hapus_pada, rekaman_jumlah_potongan
    from sesi_pemeriksaan where rekaman_hapus_pada <= ${hariIniWib} and rekaman_dihapus_pada is null`;
  const dihapus: string[] = [];
  const gagal: { id: string; pesan: string }[] = [];
  for (const s of jatuhTempo) {
    try {
      const h = await hapusBerkasRekaman(s.entri_id, s.id, s.rekaman_path);
      await db`update sesi_pemeriksaan set rekaman_dihapus_pada = now(), rekaman_path = null where id = ${s.id}`;
      await catatAudit(null, {
        aksi: "hapus", tabel: "sesi_pemeriksaan", record_id: s.id, entri_id: s.entri_id,
        ringkasan: { rekaman_path: s.rekaman_path, rekaman_hapus_pada: s.rekaman_hapus_pada, sisa_potongan: h.sisaPotongan, keterangan: "Rekaman dihapus otomatis karena masa retensi berakhir" },
      }, db);
      dihapus.push(s.id);
    } catch (e) {
      gagal.push({ id: s.id, pesan: (e as Error).message });
    }
  }
  return { tanggal: hariIniWib, retensi, ditetapkan: ditetapkan.length, dihapus: dihapus.length, gagal };
}
