import "server-only";
import type { Sql } from "@/lib/db";
import { GalatPengguna } from "@/lib/galat";
import { potonganTergabung } from "@/lib/rekaman";
import { bisaDisunting, type ButirQa, type KategoriQa, type SesiKlien, type SumberQa } from "./_jenis";

// Logika tanya-jawab mode sidang (PRD §9). Semua fungsi menerima `db`
// (koneksi atau transaksi) agar bisa diuji di dalam transaksi yang dibatalkan.

export type { ButirQa, KategoriQa, SumberQa };

const BATAS_PERTANYAAN = 2000;
const BATAS_JAWABAN = 50000;

export async function daftarQa(db: Sql, sesiId: string): Promise<ButirQa[]> {
  const rows = await db`select id, urutan, pertanyaan, jawaban, kategori, coalesce(sumber, 'baku') as sumber, terakhir_disimpan
    from qa_pemeriksaan where sesi_id = ${sesiId} order by urutan, created_at`;
  return rows.map((r) => ({
    id: r.id, urutan: r.urutan, pertanyaan: r.pertanyaan, jawaban: r.jawaban, kategori: r.kategori, sumber: r.sumber,
    terakhir_disimpan: r.terakhir_disimpan ? new Date(r.terakhir_disimpan).toISOString() : null,
  }));
}

/** Mengunci baris sesi selama transaksi agar perubahan struktur tidak bertabrakan. */
async function kunciSesi(db: Sql, sesiId: string) {
  const [s] = await db`select id, entri_id from sesi_pemeriksaan where id = ${sesiId} for update`;
  if (!s) throw new GalatPengguna("Sesi pemeriksaan tidak ditemukan.");
  return s as { id: string; entri_id: string };
}

/** Menomori ulang 1..n sesuai urutan sekarang (menjaga penomoran tetap rapat). */
export async function rapikanUrutan(db: Sql, sesiId: string) {
  await db`update qa_pemeriksaan q set urutan = x.n
    from (select id, row_number() over (order by urutan, created_at)::int as n from qa_pemeriksaan where sesi_id = ${sesiId}) x
    where q.id = x.id and q.urutan <> x.n`;
}

/**
 * Saat sesi pertama kali dibuka: salin pertanyaan baku aktif
 * (pembuka → substansi → penutup). Tidak melakukan apa pun bila sudah terisi.
 */
export async function isiPertanyaanAwal(db: Sql, sesiId: string, userId: string | null) {
  await kunciSesi(db, sesiId);
  const [{ n }] = await db`select count(*)::int as n from qa_pemeriksaan where sesi_id = ${sesiId}`;
  if (n > 0) return 0;
  const hasil = await db`insert into qa_pemeriksaan (sesi_id, urutan, pertanyaan, kategori, sumber, created_by, updated_by)
    select ${sesiId}, row_number() over (order by case bagian when 'pembuka' then 1 when 'substansi' then 2 else 3 end, urutan, created_at)::int,
      pertanyaan, bagian, 'baku', ${userId}, ${userId}
    from pertanyaan_baku where aktif
    returning id`;
  return hasil.length;
}

/** Posisi bawaan "+ Pertanyaan substansi": setelah butir substansi terakhir (atau sebelum blok penutup). */
async function posisiBawaan(db: Sql, sesiId: string) {
  const [r] = await db`select
      (select max(urutan) from qa_pemeriksaan where sesi_id = ${sesiId} and kategori = 'substansi') as subs,
      (select min(urutan) from qa_pemeriksaan where sesi_id = ${sesiId} and kategori = 'penutup') as tutup,
      (select max(urutan) from qa_pemeriksaan where sesi_id = ${sesiId}) as akhir`;
  if (r.subs != null) return Number(r.subs);
  if (r.tutup != null) return Number(r.tutup) - 1;
  return Number(r.akhir ?? 0);
}

/**
 * Menyisipkan pertanyaan substansi setelah nomor `setelah` (null = posisi bawaan).
 * Nomor butir sesudahnya otomatis bergeser.
 */
export async function sisipkanPertanyaan(
  db: Sql, sesiId: string, setelah: number | null, daftar: string[], sumber: Exclude<SumberQa, "baku">, userId: string | null,
) {
  const teks = daftar.map((t) => t.trim()).filter(Boolean);
  if (!teks.length) throw new GalatPengguna("Tuliskan pertanyaannya terlebih dahulu.");
  if (teks.some((t) => t.length > BATAS_PERTANYAAN)) throw new GalatPengguna("Pertanyaan terlalu panjang.");
  await kunciSesi(db, sesiId);
  await rapikanUrutan(db, sesiId);
  const [{ n }] = await db`select count(*)::int as n from qa_pemeriksaan where sesi_id = ${sesiId}`;
  let pos = setelah ?? (await posisiBawaan(db, sesiId));
  pos = Math.max(0, Math.min(Math.floor(pos), n));
  await db`update qa_pemeriksaan set urutan = urutan + ${teks.length} where sesi_id = ${sesiId} and urutan > ${pos}`;
  const ids: string[] = [];
  for (const [i, t] of teks.entries()) {
    const [r] = await db`insert into qa_pemeriksaan (sesi_id, urutan, pertanyaan, kategori, sumber, created_by, updated_by)
      values (${sesiId}, ${pos + i + 1}, ${t}, 'substansi', ${sumber}, ${userId}, ${userId}) returning id`;
    ids.push(r.id);
  }
  return { ids, mulaiNomor: pos + 1 };
}

async function ambilButir(db: Sql, sesiId: string, qaId: string) {
  const [b] = await db`select id, urutan, pertanyaan, jawaban, kategori, coalesce(sumber, 'baku') as sumber
    from qa_pemeriksaan where id = ${qaId} and sesi_id = ${sesiId}`;
  if (!b) throw new GalatPengguna("Pertanyaan tidak ditemukan. Muat ulang halaman.");
  return b as unknown as Pick<ButirQa, "id" | "urutan" | "pertanyaan" | "jawaban" | "kategori" | "sumber">;
}

/** Hanya pertanyaan substansi tambahan yang boleh disunting. */
export async function ubahPertanyaan(db: Sql, sesiId: string, qaId: string, teks: string, userId: string | null) {
  const t = teks.trim();
  if (!t) throw new GalatPengguna("Pertanyaan tidak boleh kosong.");
  if (t.length > BATAS_PERTANYAAN) throw new GalatPengguna("Pertanyaan terlalu panjang.");
  const b = await ambilButir(db, sesiId, qaId);
  if (!bisaDisunting(b)) throw new GalatPengguna("Pertanyaan baku tidak dapat diubah.");
  await db`update qa_pemeriksaan set pertanyaan = ${t}, updated_by = ${userId} where id = ${qaId}`;
  return { sebelum: b.pertanyaan, sesudah: t };
}

/** Hanya pertanyaan substansi tambahan yang boleh dihapus; nomor sesudahnya bergeser naik. */
export async function hapusPertanyaan(db: Sql, sesiId: string, qaId: string) {
  await kunciSesi(db, sesiId);
  const b = await ambilButir(db, sesiId, qaId);
  if (!bisaDisunting(b)) throw new GalatPengguna("Pertanyaan baku tidak dapat dihapus.");
  await db`delete from qa_pemeriksaan where id = ${qaId}`;
  await db`update qa_pemeriksaan set urutan = urutan - 1 where sesi_id = ${sesiId} and urutan > ${b.urutan}`;
  await rapikanUrutan(db, sesiId);
  return b;
}

/** Menggeser butir substansi satu langkah ke atas (-1) / bawah (+1), tetap di dalam blok substansi. */
export async function geserPertanyaan(db: Sql, sesiId: string, qaId: string, arah: -1 | 1) {
  await kunciSesi(db, sesiId);
  await rapikanUrutan(db, sesiId);
  const b = await ambilButir(db, sesiId, qaId);
  if (b.kategori !== "substansi") throw new GalatPengguna("Hanya pertanyaan substansi yang dapat dipindah.");
  const [t] = await db`select id, urutan, kategori from qa_pemeriksaan where sesi_id = ${sesiId} and urutan = ${b.urutan + arah}`;
  if (!t || t.kategori !== "substansi") return false;
  await db`update qa_pemeriksaan set urutan = ${t.urutan} where id = ${b.id}`;
  await db`update qa_pemeriksaan set urutan = ${b.urutan} where id = ${t.id}`;
  return true;
}

/** Simpan jawaban yang berubah saja. Mengembalikan waktu simpan server per butir. */
export async function simpanJawaban(db: Sql, sesiId: string, butir: { id: string; jawaban: string }[], userId: string | null) {
  const hasil: { id: string; terakhir_disimpan: string }[] = [];
  for (const b of butir) {
    if (b.jawaban.length > BATAS_JAWABAN) throw new GalatPengguna("Jawaban terlalu panjang untuk satu nomor. Pecah ke pertanyaan berikutnya.");
    const [r] = await db`update qa_pemeriksaan set jawaban = ${b.jawaban}, terakhir_disimpan = now(), updated_by = ${userId}
      where id = ${b.id} and sesi_id = ${sesiId} returning id, terakhir_disimpan`;
    if (r) hasil.push({ id: r.id, terakhir_disimpan: new Date(r.terakhir_disimpan).toISOString() });
  }
  return hasil;
}

const iso = (d: unknown) => (d ? new Date(d as string | Date).toISOString() : null);
const jam = (t: unknown) => (t ? String(t).slice(0, 5) : null);

/** Data sesi untuk layar sidang (tanpa path penyimpanan). */
export async function muatSesiKlien(db: Sql, sesiId: string): Promise<SesiKlien | null> {
  const [s] = await db`
    select s.*,
      (select b.id from berkas b where b.entri_id = s.entri_id and b.file_path = s.persetujuan_rekam_file order by b.created_at desc limit 1) as berkas_persetujuan_id,
      (select d.id from dokumen d where d.entri_id = s.entri_id and d.jenis_dokumen in ('bap', 'bap_tidak_hadir') and d.diarsipkan_pada is null
         and (d.data_isian->>'sesi_id' = s.id::text or d.snapshot_data->>'sesi_id' = s.id::text)
       order by d.created_at desc limit 1) as bap_dokumen_id
    from sesi_pemeriksaan s where s.id = ${sesiId}`;
  if (!s) return null;
  return {
    id: s.id, entri_id: s.entri_id, urutan: s.urutan, status: s.status, tanggal: s.tanggal, jam_mulai: jam(s.jam_mulai), jam_selesai: jam(s.jam_selesai),
    mulai_pada: iso(s.mulai_pada), selesai_pada: iso(s.selesai_pada), tempat: s.tempat, moda: s.moda, terperiksa_hadir: s.terperiksa_hadir,
    persetujuan_rekam: s.persetujuan_rekam, persetujuan_ditolak: s.persetujuan_ditolak, ada_file_persetujuan: !!s.persetujuan_rekam_file,
    berkas_persetujuan_id: s.berkas_persetujuan_id ?? null, rekaman_ada: !!s.rekaman_path, rekaman_jumlah_potongan: s.rekaman_jumlah_potongan,
    potongan_belum_digabung: Math.max(0, s.rekaman_jumlah_potongan - potonganTergabung(s.rekaman_path)),
    rekaman_durasi_detik: s.rekaman_durasi_detik, rekaman_hapus_pada: s.rekaman_hapus_pada, rekaman_diperpanjang: s.rekaman_diperpanjang,
    rekaman_alasan_perpanjangan: s.rekaman_alasan_perpanjangan, rekaman_dihapus_pada: iso(s.rekaman_dihapus_pada), catatan: s.catatan,
    bap_dokumen_id: s.bap_dokumen_id ?? null,
  };
}
