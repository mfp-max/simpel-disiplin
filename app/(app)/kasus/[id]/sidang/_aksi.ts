"use server";

import { revalidatePath } from "next/cache";
import { wajibHak } from "@/lib/auth";
import { sql, transaksi } from "@/lib/db";
import { catatAudit, selisih } from "@/lib/audit";
import { GalatPengguna, jalankan } from "@/lib/galat";
import { namaAman, urlUnggahTertanda } from "@/lib/penyimpanan";
import { hariIni } from "@/lib/hari-kerja";
import {
  CATATAN_PENOLAKAN, alasanTerkunci, folderPotongan, folderSesi, gabungkanPotongan, hitungTanggalHapus, muatSesiRekam,
  namaPotongan, pathRekaman, potonganTergabung, retensiHari, tanggalAkhirKasus,
} from "@/lib/rekaman";
import { buatBapDariSesi } from "@/lib/dokumen/buat";
import {
  daftarQa, geserPertanyaan, hapusPertanyaan, muatSesiKlien, simpanJawaban, sisipkanPertanyaan, ubahPertanyaan,
} from "./_qa";
import type { ButirQa, SesiKlien } from "./_jenis";

// Aksi server mode sidang (PRD §9 & §9.1). Semua aksi memeriksa hak di server;
// entri diturunkan dari sesi di basis data, bukan dari kiriman peramban.

const DETIK_POTONGAN = 10;

function jamWib() {
  return new Date(Date.now() + 7 * 3600 * 1000).toISOString().slice(11, 19);
}

async function sesiAtauGalat(sesiId: string) {
  if (!/^[0-9a-f-]{36}$/i.test(sesiId)) throw new GalatPengguna("Sesi pemeriksaan tidak ditemukan.");
  const [s] = await sql`select id, entri_id, status, urutan from sesi_pemeriksaan where id = ${sesiId}`;
  if (!s) throw new GalatPengguna("Sesi pemeriksaan tidak ditemukan.");
  return s as { id: string; entri_id: string; status: string; urutan: number };
}

async function sesiKlien(sesiId: string): Promise<SesiKlien> {
  const s = await muatSesiKlien(sql, sesiId);
  if (!s) throw new GalatPengguna("Sesi pemeriksaan tidak ditemukan.");
  return s;
}

function segarkanKasus(entriId: string) {
  revalidatePath(`/kasus/${entriId}`);
}

// ---------------------------------------------------------------------------
// Penjadwalan (panel pemeriksaan di halaman kasus)
// ---------------------------------------------------------------------------
export type MasukanJadwal = { tanggal: string; jam: string | null; tempat: string | null; moda: string; notulisId: string | null };

export async function jadwalkanSesi(entriId: string, m: MasukanJadwal) {
  return jalankan(async () => {
    const p = await wajibHak("boleh_buat");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(m.tanggal ?? "")) throw new GalatPengguna("Tanggal pemeriksaan wajib diisi.");
    if (m.jam && !/^\d{2}:\d{2}$/.test(m.jam)) throw new GalatPengguna("Format jam tidak valid (contoh 09:00).");
    const [e] = await sql`select id, kelas from entri where id = ${entriId} and diarsipkan_pada is null`;
    if (!e) throw new GalatPengguna("Kasus tidak ditemukan.");
    if (m.notulisId) {
      const [u] = await sql`select id from app_users where id = ${m.notulisId} and aktif`;
      if (!u) throw new GalatPengguna("Notulis harus pengguna SIMPEL yang aktif.");
    }
    const s = await transaksi(async (tx) => {
      await tx`select id from entri where id = ${entriId} for update`;
      const [{ n }] = await tx`select coalesce(max(urutan), 0)::int + 1 as n from sesi_pemeriksaan where entri_id = ${entriId}`;
      const [r] = await tx`insert into sesi_pemeriksaan (entri_id, urutan, status, tanggal, jam_mulai, tempat, moda, notulis_user_id, created_by, updated_by)
        values (${entriId}, ${n}, 'direncanakan', ${m.tanggal}, ${m.jam || null}, ${m.tempat?.trim() || null}, ${m.moda || "tatap_muka"},
          ${m.notulisId || null}, ${p.id}, ${p.id}) returning id, urutan`;
      await catatAudit(p, { aksi: "buat", tabel: "sesi_pemeriksaan", record_id: r.id, entri_id: entriId,
        ringkasan: { urutan: r.urutan, tanggal: m.tanggal, jam: m.jam, tempat: m.tempat, moda: m.moda } }, tx);
      return r as { id: string; urutan: number };
    });
    segarkanKasus(entriId);
    return s;
  }, "Sesi pemeriksaan dijadwalkan");
}

/** Pintasan di panel kasus: terperiksa tidak hadir → sesi ditutup dengan catatan tidak hadir. */
export async function tandaiTidakHadirSesi(sesiId: string) {
  return jalankan(async () => {
    const p = await wajibHak("boleh_buat");
    const s = await sesiAtauGalat(sesiId);
    await sql`update sesi_pemeriksaan set terperiksa_hadir = false, status = 'selesai',
        tanggal = coalesce(tanggal, ${hariIni()}), selesai_pada = coalesce(selesai_pada, now()), updated_by = ${p.id}
      where id = ${sesiId}`;
    await catatAudit(p, { aksi: "ubah", tabel: "sesi_pemeriksaan", record_id: sesiId, entri_id: s.entri_id,
      ringkasan: { terperiksa_hadir: false, status: { sebelum: s.status, sesudah: "selesai" }, keterangan: "Terperiksa tidak hadir" } });
    segarkanKasus(s.entri_id);
  }, "Sesi ditandai: terperiksa tidak hadir");
}

// ---------------------------------------------------------------------------
// Jalannya sidang
// ---------------------------------------------------------------------------
export async function aturKehadiran(sesiId: string, hadir: boolean) {
  return jalankan(async () => {
    const p = await wajibHak("boleh_buat");
    const s = await sesiAtauGalat(sesiId);
    const [lama] = await sql`select terperiksa_hadir from sesi_pemeriksaan where id = ${sesiId}`;
    await sql`update sesi_pemeriksaan set terperiksa_hadir = ${hadir}, updated_by = ${p.id} where id = ${sesiId}`;
    await catatAudit(p, { aksi: "ubah", tabel: "sesi_pemeriksaan", record_id: sesiId, entri_id: s.entri_id,
      ringkasan: selisih(lama, { terperiksa_hadir: hadir }) });
    segarkanKasus(s.entri_id);
    return sesiKlien(sesiId);
  }, hadir ? "Terperiksa ditandai hadir" : "Terperiksa ditandai tidak hadir");
}

export async function mulaiSesi(sesiId: string) {
  return jalankan(async () => {
    const p = await wajibHak("boleh_buat");
    const s = await sesiAtauGalat(sesiId);
    if (s.status === "selesai") throw new GalatPengguna("Sesi ini sudah selesai.");
    await sql`update sesi_pemeriksaan set status = 'berjalan', mulai_pada = coalesce(mulai_pada, now()),
        jam_mulai = case when mulai_pada is null then ${jamWib()}::time else jam_mulai end,
        tanggal = case when mulai_pada is null then ${hariIni()}::date else tanggal end, updated_by = ${p.id}
      where id = ${sesiId}`;
    await catatAudit(p, { aksi: "ubah", tabel: "sesi_pemeriksaan", record_id: sesiId, entri_id: s.entri_id,
      ringkasan: { status: { sebelum: s.status, sesudah: "berjalan" }, keterangan: "Pemeriksaan dimulai" } });
    segarkanKasus(s.entri_id);
    return sesiKlien(sesiId);
  }, "Pemeriksaan dimulai");
}

/** Simpan otomatis: hanya butir yang berubah. Audit dicatat paling sering tiap 10 menit per pengguna per sesi. */
export async function simpanJawabanSesi(sesiId: string, butir: { id: string; jawaban: string }[]) {
  return jalankan(async () => {
    const p = await wajibHak("boleh_buat");
    const s = await sesiAtauGalat(sesiId);
    if (!Array.isArray(butir) || butir.length > 500) throw new GalatPengguna("Data jawaban tidak valid.");
    const tersimpan = await simpanJawaban(sql, sesiId, butir.map((b) => ({ id: String(b.id), jawaban: String(b.jawaban ?? "") })), p.id);
    const [baru] = await sql`select 1 from audit_log where entri_id = ${s.entri_id} and tabel = 'qa_pemeriksaan' and record_id = ${sesiId}
      and user_id = ${p.id} and aksi = 'ubah' and waktu > now() - interval '10 minutes' limit 1`;
    if (!baru) {
      await catatAudit(p, { aksi: "ubah", tabel: "qa_pemeriksaan", record_id: sesiId, entri_id: s.entri_id,
        ringkasan: { keterangan: "Jawaban pemeriksaan disimpan (simpan otomatis)", jumlah_butir: tersimpan.length } });
    }
    return { tersimpan, waktu: new Date().toISOString() };
  });
}

async function ubahStruktur(sesiId: string, ket: string, fn: (tx: typeof sql, userId: string) => Promise<Record<string, unknown>>) {
  const p = await wajibHak("boleh_buat");
  const s = await sesiAtauGalat(sesiId);
  return transaksi(async (tx) => {
    const { __aksi, ...ringkasan } = await fn(tx, p.id);
    await catatAudit(p, { aksi: __aksi === "hapus" ? "hapus" : __aksi === "buat" ? "buat" : "ubah",
      tabel: "qa_pemeriksaan", record_id: sesiId, entri_id: s.entri_id, ringkasan: { keterangan: ket, ...ringkasan } }, tx);
    return { daftar: await daftarQa(tx, sesiId) };
  });
}

export async function tambahPertanyaanSesi(sesiId: string, setelah: number | null, pertanyaan: string) {
  return jalankan(
    () => ubahStruktur(sesiId, "Pertanyaan substansi disisipkan", async (tx, uid) => {
      const r = await sisipkanPertanyaan(tx, sesiId, setelah, [pertanyaan], "tambahan", uid);
      return { __aksi: "buat", nomor: r.mulaiNomor, pertanyaan: pertanyaan.trim() };
    }),
    "Pertanyaan ditambahkan",
  );
}

export async function tambahDariBankSesi(sesiId: string, setelah: number | null, bankIds: string[]) {
  return jalankan(
    () => ubahStruktur(sesiId, "Pertanyaan dari bank pertanyaan disisipkan", async (tx, uid) => {
      const ids = (bankIds ?? []).filter((x) => /^[0-9a-f-]{36}$/i.test(x));
      if (!ids.length) throw new GalatPengguna("Pilih minimal satu pertanyaan.");
      const rows = await tx`select pertanyaan from bank_pertanyaan where id in ${tx(ids)} and aktif order by nama_set, urutan, created_at`;
      if (!rows.length) throw new GalatPengguna("Pertanyaan yang dipilih tidak tersedia lagi.");
      const r = await sisipkanPertanyaan(tx, sesiId, setelah, rows.map((x) => x.pertanyaan as string), "bank", uid);
      return { __aksi: "buat", nomor: r.mulaiNomor, jumlah: rows.length };
    }),
    "Pertanyaan dari bank ditambahkan",
  );
}

export async function ubahPertanyaanSesi(sesiId: string, qaId: string, pertanyaan: string) {
  return jalankan(
    () => ubahStruktur(sesiId, "Pertanyaan tambahan disunting", async (tx, uid) => {
      const r = await ubahPertanyaan(tx, sesiId, qaId, pertanyaan, uid);
      return { qa_id: qaId, pertanyaan: r };
    }),
    "Pertanyaan diperbarui",
  );
}

export async function hapusPertanyaanSesi(sesiId: string, qaId: string) {
  return jalankan(
    () => ubahStruktur(sesiId, "Pertanyaan tambahan dihapus", async (tx) => {
      const b = await hapusPertanyaan(tx, sesiId, qaId);
      return { __aksi: "hapus", qa_id: qaId, nomor: b.urutan, pertanyaan: b.pertanyaan, jawaban: b.jawaban };
    }),
    "Pertanyaan dihapus",
  );
}

export async function geserPertanyaanSesi(sesiId: string, qaId: string, arah: -1 | 1) {
  return jalankan(() =>
    ubahStruktur(sesiId, "Urutan pertanyaan diubah", async (tx) => {
      const ok = await geserPertanyaan(tx, sesiId, qaId, arah === -1 ? -1 : 1);
      if (!ok) throw new GalatPengguna("Pertanyaan sudah berada di ujung blok substansi.");
      return { qa_id: qaId, arah: arah === -1 ? "naik" : "turun" };
    }),
  );
}

export async function muatUlangQa(sesiId: string) {
  return jalankan(async (): Promise<{ daftar: ButirQa[]; sesi: SesiKlien }> => {
    await wajibHak("boleh_buat");
    await sesiAtauGalat(sesiId);
    return { daftar: await daftarQa(sql, sesiId), sesi: await sesiKlien(sesiId) };
  });
}

/** Selesai & Susun BAP: tutup sesi (bila belum), lalu bangkitkan BAP .docx. */
export async function selesaiDanSusunBap(sesiId: string) {
  return jalankan(async () => {
    const p = await wajibHak("boleh_buat");
    const s = await sesiAtauGalat(sesiId);
    const r = await muatSesiRekam(sesiId);
    if (r && r.rekaman_jumlah_potongan > potonganTergabung(r.rekaman_path)) throw new GalatPengguna("Hentikan dan simpan rekaman terlebih dahulu sebelum menyusun BAP.");
    if (s.status !== "selesai") {
      await sql`update sesi_pemeriksaan set status = 'selesai', selesai_pada = coalesce(selesai_pada, now()),
          jam_selesai = coalesce(jam_selesai, ${jamWib()}::time), mulai_pada = coalesce(mulai_pada, now()),
          tanggal = coalesce(tanggal, ${hariIni()}::date), updated_by = ${p.id}
        where id = ${sesiId}`;
      await catatAudit(p, { aksi: "ubah", tabel: "sesi_pemeriksaan", record_id: sesiId, entri_id: s.entri_id,
        ringkasan: { status: { sebelum: s.status, sesudah: "selesai" }, keterangan: "Pemeriksaan selesai" } });
    }
    segarkanKasus(s.entri_id);
    const { dokumenId } = await buatBapDariSesi(sesiId, { id: p.id, email: p.email, nama: p.nama });
    await catatAudit(p, { aksi: "buat", tabel: "dokumen", record_id: dokumenId, entri_id: s.entri_id,
      ringkasan: { jenis_dokumen: "bap", sesi_id: sesiId, sesi_urutan: s.urutan, keterangan: "BAP disusun dari mode sidang" } });
    segarkanKasus(s.entri_id);
    return { dokumenId, sesi: await sesiKlien(sesiId) };
  }, "Berita Acara Pemeriksaan selesai disusun");
}

// ---------------------------------------------------------------------------
// Persetujuan perekaman (§9.1 butir 1 & 3)
// ---------------------------------------------------------------------------
export async function aturPersetujuanRekam(sesiId: string, setuju: boolean) {
  return jalankan(async () => {
    const p = await wajibHak("boleh_buat");
    const s = await sesiAtauGalat(sesiId);
    await sql`update sesi_pemeriksaan set persetujuan_rekam = ${setuju},
        persetujuan_ditolak = case when ${setuju} then false else persetujuan_ditolak end,
        catatan = case when ${setuju} and catatan = ${CATATAN_PENOLAKAN} then null else catatan end,
        updated_by = ${p.id}
      where id = ${sesiId}`;
    await catatAudit(p, { aksi: "ubah", tabel: "sesi_pemeriksaan", record_id: sesiId, entri_id: s.entri_id,
      ringkasan: { persetujuan_rekam: setuju } });
    return sesiKlien(sesiId);
  });
}

export async function aturPenolakanRekam(sesiId: string, tolak: boolean) {
  return jalankan(async () => {
    const p = await wajibHak("boleh_buat");
    const s = await sesiAtauGalat(sesiId);
    const r = await muatSesiRekam(sesiId);
    if (tolak && r && r.rekaman_jumlah_potongan > potonganTergabung(r.rekaman_path)) throw new GalatPengguna("Hentikan dan simpan rekaman yang sedang berjalan terlebih dahulu.");
    if (tolak) {
      await sql`update sesi_pemeriksaan set persetujuan_ditolak = true, persetujuan_rekam = false,
          catatan = case when coalesce(catatan, '') = '' then ${CATATAN_PENOLAKAN}
                         when position(${CATATAN_PENOLAKAN} in catatan) > 0 then catatan
                         else catatan || E'\n' || ${CATATAN_PENOLAKAN} end,
          updated_by = ${p.id} where id = ${sesiId}`;
    } else {
      await sql`update sesi_pemeriksaan set persetujuan_ditolak = false,
          catatan = nullif(trim(replace(coalesce(catatan, ''), ${CATATAN_PENOLAKAN}, '')), ''),
          updated_by = ${p.id} where id = ${sesiId}`;
    }
    await catatAudit(p, { aksi: "ubah", tabel: "sesi_pemeriksaan", record_id: sesiId, entri_id: s.entri_id,
      ringkasan: { persetujuan_ditolak: tolak, keterangan: tolak ? "Terperiksa menolak perekaman (dicatat di BAP, tidak memberatkan)" : "Penolakan perekaman dibatalkan" } });
    return sesiKlien(sesiId);
  }, tolak ? "Penolakan perekaman dicatat. Pemeriksaan berlanjut tanpa rekaman." : "Catatan penolakan dibatalkan");
}

const MIME_PERSETUJUAN = /^(application\/pdf|image\/(jpeg|png|webp|heic|heif))$/i;

export async function siapkanUnggahPersetujuan(sesiId: string, info: { nama: string; mime: string; ukuran: number }) {
  return jalankan(async () => {
    await wajibHak("boleh_buat");
    const s = await sesiAtauGalat(sesiId);
    if (info.mime && !MIME_PERSETUJUAN.test(info.mime)) throw new GalatPengguna("Unggah pindaian surat dalam format PDF atau foto (JPG/PNG).");
    if (info.ukuran > 20 * 1024 * 1024) throw new GalatPengguna("Berkas terlalu besar (maks. 20 MB).");
    const path = `${folderSesi(s.entri_id, sesiId)}/persetujuan-${Date.now()}-${namaAman(info.nama)}`;
    const u = await urlUnggahTertanda(path);
    return { signedUrl: u.signedUrl, path };
  });
}

export async function konfirmasiUnggahPersetujuan(sesiId: string, info: { path: string; nama: string; mime: string; ukuran: number }) {
  return jalankan(async () => {
    const p = await wajibHak("boleh_buat");
    const s = await sesiAtauGalat(sesiId);
    if (!info.path.startsWith(`${folderSesi(s.entri_id, sesiId)}/persetujuan-`)) throw new GalatPengguna("Lokasi berkas tidak valid.");
    await transaksi(async (tx) => {
      const [b] = await tx`insert into berkas (entri_id, nama_file, file_path, mime, ukuran, kategori, keterangan, created_by, updated_by)
        values (${s.entri_id}, ${info.nama}, ${info.path}, ${info.mime || null}, ${info.ukuran}, 'persetujuan_rekam',
          ${`Surat persetujuan perekaman — pemeriksaan sesi ${s.urutan}`}, ${p.id}, ${p.id}) returning id`;
      await tx`update sesi_pemeriksaan set persetujuan_rekam_file = ${info.path}, updated_by = ${p.id} where id = ${sesiId}`;
      await catatAudit(p, { aksi: "buat", tabel: "berkas", record_id: b.id, entri_id: s.entri_id,
        ringkasan: { nama_file: info.nama, kategori: "persetujuan_rekam", sesi_id: sesiId } }, tx);
      await catatAudit(p, { aksi: "ubah", tabel: "sesi_pemeriksaan", record_id: sesiId, entri_id: s.entri_id,
        ringkasan: { persetujuan_rekam_file: "diunggah" } }, tx);
    });
    segarkanKasus(s.entri_id);
    return sesiKlien(sesiId);
  }, "Surat persetujuan perekaman tersimpan");
}

// ---------------------------------------------------------------------------
// Perekaman bertahap (§9.1)
// ---------------------------------------------------------------------------
async function sesiBolehRekam(sesiId: string) {
  const s = await muatSesiRekam(sesiId);
  if (!s) throw new GalatPengguna("Sesi pemeriksaan tidak ditemukan.");
  const kunci = alasanTerkunci(s);
  if (kunci) throw new GalatPengguna(kunci);
  if (s.status !== "berjalan") throw new GalatPengguna("Mulai pemeriksaan terlebih dahulu sebelum merekam.");
  return s;
}

/** Dipanggil saat tombol rekam ditekan: memeriksa pengaman & mengembalikan nomor potongan berikutnya. */
export async function mulaiRekaman(sesiId: string) {
  return jalankan(async () => {
    const p = await wajibHak("boleh_buat");
    const s = await sesiBolehRekam(sesiId);
    await catatAudit(p, { aksi: "buat", tabel: "sesi_pemeriksaan", record_id: sesiId, entri_id: s.entri_id,
      ringkasan: { keterangan: "Perekaman audio dimulai atas persetujuan tertulis terperiksa", potongan_awal: s.rekaman_jumlah_potongan + 1 } });
    return { nomorBerikut: s.rekaman_jumlah_potongan + 1, detikPotongan: DETIK_POTONGAN };
  });
}

export async function siapkanPotonganRekaman(sesiId: string, nomor: number) {
  return jalankan(async () => {
    await wajibHak("boleh_buat");
    const s = await sesiBolehRekam(sesiId);
    if (!Number.isInteger(nomor) || nomor < 1 || nomor > 99999) throw new GalatPengguna("Nomor potongan tidak valid.");
    const path = `${folderPotongan(s.entri_id, sesiId)}/${namaPotongan(nomor)}`;
    if (nomor <= s.rekaman_jumlah_potongan) return { sudahAda: true as const, path, signedUrl: "" };
    try {
      const u = await urlUnggahTertanda(path);
      return { sudahAda: false as const, path, signedUrl: u.signedUrl };
    } catch (e) {
      if (/exist|duplicate/i.test((e as Error).message)) return { sudahAda: true as const, path, signedUrl: "" };
      throw e;
    }
  });
}

export async function konfirmasiPotonganRekaman(sesiId: string, nomor: number) {
  return jalankan(async () => {
    await wajibHak("boleh_buat");
    await sesiAtauGalat(sesiId);
    if (!Number.isInteger(nomor) || nomor < 1 || nomor > 99999) throw new GalatPengguna("Nomor potongan tidak valid.");
    const [r] = await sql`update sesi_pemeriksaan set rekaman_jumlah_potongan = greatest(rekaman_jumlah_potongan, ${nomor})
      where id = ${sesiId} returning rekaman_jumlah_potongan`;
    return { jumlah: r.rekaman_jumlah_potongan as number };
  });
}

/** Menggabungkan potongan menjadi satu rekaman.webm (berurutan), lalu menghapus potongan. */
export async function selesaikanRekaman(sesiId: string, durasiDetik: number | null) {
  return jalankan(async () => {
    const p = await wajibHak("boleh_buat");
    const s = await muatSesiRekam(sesiId);
    if (!s) throw new GalatPengguna("Sesi pemeriksaan tidak ditemukan.");
    if (s.rekaman_dihapus_pada) throw new GalatPengguna("Rekaman sesi ini sudah dihapus sesuai masa retensi.");
    const dari = potonganTergabung(s.rekaman_path) + 1;
    const sampai = s.rekaman_jumlah_potongan;
    if (sampai < dari) throw new GalatPengguna("Belum ada potongan rekaman baru yang terunggah.");
    const jumlah = sampai - dari + 1;
    const tujuan = pathRekaman(s.entri_id, sesiId, sampai);
    const g = await gabungkanPotongan({ folder: folderPotongan(s.entri_id, sesiId), dari, sampai, tujuan, awal: s.rekaman_path });
    const durasi = Math.max(0, Math.round(durasiDetik ?? jumlah * DETIK_POTONGAN));
    const akhir = await tanggalAkhirKasus(s.entri_id);
    const hapusPada = s.rekaman_hapus_pada ?? (akhir ? hitungTanggalHapus(akhir, await retensiHari()) : null);
    await sql`update sesi_pemeriksaan set rekaman_path = ${tujuan},
        rekaman_durasi_detik = coalesce(rekaman_durasi_detik, 0) + ${durasi}, rekaman_hapus_pada = ${hapusPada}, updated_by = ${p.id}
      where id = ${sesiId}`;
    await catatAudit(p, { aksi: "buat", tabel: "sesi_pemeriksaan", record_id: sesiId, entri_id: s.entri_id,
      ringkasan: { keterangan: "Rekaman audio disimpan", potongan: jumlah, potongan_hilang: g.hilang, ukuran_byte: g.ukuran, durasi_detik: durasi, digabung_dengan_rekaman_lama: !!s.rekaman_path, rekaman_hapus_pada: hapusPada } });
    segarkanKasus(s.entri_id);
    return { sesi: await sesiKlien(sesiId), hilang: g.hilang };
  }, "Rekaman tersimpan");
}

/** Admin memperpanjang masa simpan rekaman SATU kali dengan alasan tertulis (§9.1 butir 5). */
export async function perpanjangRetensiRekaman(sesiId: string, tanggalBaru: string, alasan: string) {
  return jalankan(async () => {
    const p = await wajibHak("kelola_pengaturan");
    const s = await muatSesiRekam(sesiId);
    if (!s) throw new GalatPengguna("Sesi pemeriksaan tidak ditemukan.");
    if (s.rekaman_dihapus_pada) throw new GalatPengguna("Rekaman sudah dihapus.");
    if (s.rekaman_diperpanjang) throw new GalatPengguna("Masa simpan rekaman ini sudah pernah diperpanjang. Perpanjangan hanya boleh satu kali.");
    if (!s.rekaman_hapus_pada) throw new GalatPengguna("Tanggal hapus belum ditetapkan karena kasus belum selesai atau dihentikan.");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(tanggalBaru ?? "")) throw new GalatPengguna("Tanggal baru tidak valid.");
    if (tanggalBaru <= s.rekaman_hapus_pada) throw new GalatPengguna("Tanggal baru harus setelah tanggal hapus yang berlaku sekarang.");
    if ((alasan ?? "").trim().length < 10) throw new GalatPengguna("Tuliskan alasan perpanjangan (minimal 10 karakter).");
    await sql`update sesi_pemeriksaan set rekaman_hapus_pada = ${tanggalBaru}, rekaman_diperpanjang = true,
        rekaman_alasan_perpanjangan = ${alasan.trim()}, updated_by = ${p.id}
      where id = ${sesiId} and rekaman_diperpanjang = false`;
    await catatAudit(p, { aksi: "ubah", tabel: "sesi_pemeriksaan", record_id: sesiId, entri_id: s.entri_id, alasan: alasan.trim(),
      ringkasan: { rekaman_hapus_pada: { sebelum: s.rekaman_hapus_pada, sesudah: tanggalBaru }, rekaman_diperpanjang: true } });
    segarkanKasus(s.entri_id);
    return sesiKlien(sesiId);
  }, "Masa simpan rekaman diperpanjang");
}
