import "server-only";
import { sql, type Sql } from "@/lib/db";
import { GalatPengguna } from "@/lib/galat";
import { durasiBulan, namaHari, tanggalAngka, tanggalPanjang, tanggalTerbilang } from "@/lib/format";
import { rangkaiPasal } from "@/lib/dokumen/pasal";

// Konteks dokumen: nilai untuk SETIAP placeholder di tabel template_placeholder,
// dirangkai dari data kasus. Kode di sini hanya merangkai data — tidak memuat
// aturan hukum. Data riwayat diambil dari salinan beku (snapshot_*), bukan dari
// katalog terkini (PRD §18.3).

type Baris = Record<string, unknown>;
type Placeholder = { kode: string; jenis: string; sumber: string; field: { kode: string }[] | null };

const BULAN_KODE = ["jan", "feb", "mar", "apr", "mei", "jun", "jul", "agu", "sep", "okt", "nov", "des"];
const HURUF = "abcdefghijklmnopqrstuvwxyz";

function teks(v: unknown): string {
  if (v === null || v === undefined) return "";
  if (typeof v === "string") return v.trim();
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  if (v instanceof Date) return tanggalPanjang(v, "");
  return "";
}

function pertama(...v: unknown[]): string {
  for (const x of v) {
    const t = teks(x);
    if (t) return t;
  }
  return "";
}

function unik(daftar: string[]) {
  return [...new Set(daftar.map((x) => x.trim()).filter(Boolean))];
}

/** "09:00:00" → "09.00 WIB" */
export function jamWib(j: unknown): string {
  const t = teks(j);
  const m = t.match(/^(\d{1,2}):(\d{2})/);
  return m ? `${m[1].padStart(2, "0")}.${m[2]} WIB` : t;
}

export function hariIniWib(): string {
  const w = new Date(Date.now() + 7 * 3600 * 1000);
  return w.toISOString().slice(0, 10);
}

function pangkatGolongan(pangkat: unknown, golongan: unknown, gabungan?: unknown) {
  const a = teks(pangkat);
  const b = teks(golongan);
  if (a && b) return a.includes(b) ? a : `${a}, ${b}`;
  return a || b || teks(gabungan);
}

function nomorRomawi(n: number) {
  return ["", "I", "II", "III", "IV", "V"][n] ?? String(n);
}

export async function konteksDokumen(
  entriId: string,
  opsi: { sesiId?: string | null; tahapanId?: string | null; penggunaNama?: string; db?: Sql } = {},
): Promise<Record<string, unknown>> {
  const db = opsi.db ?? sql;

  const [e] = await db`
    select e.*, r.nama_lengkap as reg_nama_lengkap, r.judul as reg_judul, r.nama_singkat as reg_nama_singkat,
      th.nama as tingkat_dugaan_nama, jh.nama as jenis_entri_nama
    from entri e
    left join regulasi r on r.id = e.regulasi_id
    left join tingkat_hukuman th on th.id = e.tingkat_hukuman_dugaan_id
    left join jenis_hukuman jh on jh.id = e.jenis_hukuman_id
    where e.id = ${entriId}`;
  if (!e) throw new GalatPengguna("Kasus tidak ditemukan.");

  const sesiQuery = opsi.sesiId
    ? db`select * from sesi_pemeriksaan where id = ${opsi.sesiId} and entri_id = ${entriId}`
    : db`select * from sesi_pemeriksaan where entri_id = ${entriId} order by urutan desc, created_at desc limit 1`;

  const [
    katalog, pengaturanRows, pegawaiRows, pelanggaran, timRows, sesiRows, tahapan, dokPanggilan, hukumanRows, referensiRows, kaidahRows,
  ] = await Promise.all([
    db`select kode, jenis, sumber, field from template_placeholder`,
    db`select kunci, nilai from pengaturan`,
    e.pegawai_id ? db`select * from pegawai where id = ${e.pegawai_id}` : Promise.resolve([] as unknown as Baris[]),
    db`select * from pelanggaran_entri where entri_id = ${entriId} order by urutan, created_at`,
    db`select * from tim_pemeriksa where entri_id = ${entriId} order by created_at desc limit 1`,
    sesiQuery,
    db`select id, kode_tahap, status, tanggal_rencana, tanggal_realisasi, urutan from tahapan_kasus where entri_id = ${entriId} order by urutan`,
    db`select d.nomor, d.tanggal, d.status, d.versi, t.kode_tahap, d.snapshot_data->>'urutan_panggilan' as urut
       from dokumen d left join tahapan_kasus t on t.id = d.tahapan_id
       where d.entri_id = ${entriId} and d.diarsipkan_pada is null
         and (t.kode_tahap in ('panggilan_1', 'panggilan_2') or d.jenis_dokumen = 'surat_panggilan')
       order by (d.status <> 'draf') desc, d.created_at desc`,
    db`select * from hukuman where entri_id = ${entriId} order by created_at desc limit 1`,
    db`select kategori, kode, label from kode_referensi where kategori in ('unsur_tim', 'jabatan_dalam_tim', 'dampak')`,
    e.regulasi_id
      ? db`select kunci, nilai from aturan_kaidah where regulasi_id = ${e.regulasi_id} and kunci in ('konsideran_mengingat', 'konsideran_menimbang')`
      : Promise.resolve([] as unknown as Baris[]),
  ]);

  const set = Object.fromEntries(pengaturanRows.map((r) => [r.kunci as string, r.nilai])) as Record<string, unknown>;
  const ref = (kategori: string, kode: unknown) =>
    (referensiRows.find((r) => r.kategori === kategori && r.kode === kode)?.label as string | undefined) ?? teks(kode);
  const kaidah = Object.fromEntries(kaidahRows.map((r) => [r.kunci as string, r.nilai])) as Record<string, unknown>;

  const pg = (pegawaiRows[0] ?? null) as Baris | null;
  const sp = ((e.snapshot_pegawai ?? {}) as Baris) || {};
  const sr = ((e.snapshot_regulasi ?? {}) as Baris) || {};
  const kalk = ((e.kalkulasi ?? {}) as Baris) || {};
  const kew = ((kalk.kewenangan ?? {}) as Record<string, Baris | null>) || {};
  const tambahan = ((e.data_tambahan ?? {}) as Baris) || {};
  const sesi = (sesiRows[0] ?? null) as Baris | null;
  const tim = (timRows[0] ?? null) as Baris | null;
  const huk = (hukumanRows[0] ?? null) as Baris | null;
  const sjh = ((huk?.snapshot_jenis_hukuman ?? null) as Baris | null) ?? null;
  const spj = ((huk?.snapshot_pejabat ?? null) as Baris | null) ?? null;

  const [anggota, qa, kehadiran, atasanRows] = await Promise.all([
    tim
      ? db`select a.*, p.nama_lengkap_gelar, p.nip, p.pangkat, p.golongan_ruang as pg_golongan, p.golongan_pangkat,
            p.jabatan_tambahan, p.jabatan_fungsional, p.jenis_pegawai, p.unit_kerja, g.pangkat as pangkat_gol
          from anggota_tim a
          left join pegawai p on p.id = a.pegawai_id
          left join golongan_ruang g on upper(g.kode) = upper(coalesce(p.golongan_ruang, a.golongan_ruang))
          where a.tim_id = ${tim.id as string} order by a.urutan, a.created_at`
      : Promise.resolve([] as unknown as Baris[]),
    sesi ? db`select urutan, pertanyaan, jawaban from qa_pemeriksaan where sesi_id = ${sesi.id as string} order by urutan` : Promise.resolve([] as unknown as Baris[]),
    e.pegawai_id
      ? db`select tahun, bulan, jumlah_hari from catatan_kehadiran where pegawai_id = ${e.pegawai_id} order by tahun, bulan`
      : Promise.resolve([] as unknown as Baris[]),
    pg?.pejabat_penilai_nip
      ? db`select nama_lengkap_gelar, nip, jabatan_tambahan, jabatan_fungsional, jenis_pegawai from pegawai where nip = ${pg.pejabat_penilai_nip as string} limit 1`
      : Promise.resolve([] as unknown as Baris[]),
  ]);

  const v: Record<string, unknown> = {};
  const hariIni = hariIniWib();

  // --- Terperiksa (salinan beku; cadangan: data pegawai terkini) ---
  v.nama_terperiksa = pertama(sp.nama_lengkap_gelar, pg?.nama_lengkap_gelar, e.nama_pegawai_bebas);
  v.nama_terperiksa_tanpa_gelar = pertama(sp.nama_tanpa_gelar, pg?.nama_tanpa_gelar, v.nama_terperiksa);
  v.nip_terperiksa = pertama(sp.nip, pg?.nip, e.nip_bebas);
  v.pangkat_terperiksa = pertama(sp.pangkat, pg?.pangkat);
  v.golongan_terperiksa = pertama(sp.golongan_ruang, pg?.golongan_ruang);
  v.pangkat_golongan_terperiksa = pangkatGolongan(v.pangkat_terperiksa, v.golongan_terperiksa, pertama(sp.golongan_pangkat, pg?.golongan_pangkat));
  v.jabatan_terperiksa = pertama(sp.jabatan, pg?.jabatan_tambahan, pg?.jabatan_fungsional, pg?.jenis_pegawai);
  v.unit_kerja_terperiksa = pertama(sp.unit_kerja, pg?.unit_kerja, e.unit_kerja_bebas);
  v.fakultas_terperiksa = pertama(sp.direktorat_fakultas, pg?.direktorat_fakultas);
  v.status_pegawai_terperiksa = pertama(sp.status_pegawai, pg?.status_pegawai);
  v.tempat_lahir_terperiksa = pertama(sp.tempat_lahir, pg?.tempat_lahir);
  v.tanggal_lahir_terperiksa = tanggalPanjang(pertama(sp.tanggal_lahir, pg?.tanggal_lahir) || null, "");

  // --- Kasus ---
  const pasalBeku = pelanggaran.filter((p) => p.snapshot_pasal).map((p) => p.snapshot_pasal as { pasal: string; ayat?: string; huruf?: string; angka?: string });
  v.nomor_registrasi = teks(e.nomor_registrasi);
  v.judul_kasus = teks(e.judul);
  // Tanpa titik akhir: template menyambungnya dengan tanda baca sendiri ("... disiplin {uraian_dugaan}.").
  v.uraian_dugaan = pertama(e.ringkasan, unik(pelanggaran.map((p) => teks(p.uraian_perbuatan))).join("; "), e.judul).replace(/[\s.]+$/, "");
  // Hanya dari salinan pasal kasus ini (peraturan yang sama) — lihat lib/dokumen/pasal.ts
  v.pasal_dilanggar = pasalBeku.length
    ? rangkaiPasal(pasalBeku)
    : unik(pelanggaran.map((p) => teks(p.pasal_teks_bebas))).join("; ");
  v.nama_regulasi = pertama(sr.nama_lengkap, e.reg_nama_lengkap, e.reg_judul);
  v.nama_regulasi_singkat = pertama(sr.nama_singkat, e.reg_nama_singkat);
  v.tingkat_hukuman = pertama(sjh?.tingkat, (kalk.tingkat as Baris | undefined)?.nama, e.tingkat_dugaan_nama);
  const pengganti = (sjh?.pengganti_sementara ?? null) as Baris | null;
  v.jenis_hukuman = pertama(pengganti?.nama, sjh?.nama, e.jenis_entri_nama, (kalk.usulan_kehadiran as Baris | undefined)?.jenisEfektif);
  v.dampak_perbuatan = unik(pelanggaran.map((p) => (p.dampak ? ref("dampak", p.dampak) : ""))).join(", ");
  v.faktor_memberatkan = "";
  v.faktor_meringankan = "";
  v.waktu_perbuatan = pertama(unik(pelanggaran.map((p) => teks(p.waktu))).join("; "), e.tanggal_peristiwa ? tanggalPanjang(e.tanggal_peristiwa as string) : "");
  v.tempat_perbuatan = unik(pelanggaran.map((p) => teks(p.tempat))).join("; ");
  v.kronologi = pertama(e.ringkasan);
  const kenaIk = huk ? !!huk.pemotongan_ik : !!e.pemotongan_ik;
  v.pemotongan_ik_teks = kenaIk ? pertama(set.teks_pemotongan_ik, "disertai pemotongan insentif kinerja") : "";
  v.pelanggaran = pelanggaran.map((p, i) => {
    const s = (p.snapshot_pasal ?? null) as { pasal: string; ayat?: string; huruf?: string; angka?: string; teks?: string } | null;
    return {
      nomor: String(i + 1),
      pasal: s ? rangkaiPasal([s]) : teks(p.pasal_teks_bebas),
      teks_pasal: teks(s?.teks),
      uraian: teks(p.uraian_perbuatan),
      dampak: p.dampak ? ref("dampak", p.dampak) : "",
      waktu: teks(p.waktu),
      tempat: teks(p.tempat),
    };
  });

  // --- Surat (nomor & tanggal diisi dari dialog; bawaan hari ini) ---
  v.nomor_surat = "";
  v.tanggal_surat = tanggalAngka(hariIni);
  v.tanggal_surat_panjang = tanggalPanjang(hariIni);
  v.sifat_surat = pertama(set.sifat_surat, "Rahasia");
  v.hal_surat = "";
  v.lampiran_surat = pertama(set.lampiran_surat, "-");
  v.tahun_surat = hariIni.slice(0, 4);

  // --- Pemeriksaan ---
  const tahapPemeriksaan = tahapan.find((t) => t.kode_tahap === "pemeriksaan");
  const tglPeriksa = pertama(sesi?.tanggal, tahapPemeriksaan?.tanggal_realisasi, tahapPemeriksaan?.tanggal_rencana) || null;
  v.hari_pemeriksaan = namaHari(tglPeriksa);
  v.tanggal_pemeriksaan = tanggalPanjang(tglPeriksa, "");
  v.tanggal_pemeriksaan_terbilang = tanggalTerbilang(tglPeriksa);
  v.jam_pemeriksaan = jamWib(sesi?.jam_mulai);
  v.jam_selesai_pemeriksaan = jamWib(sesi?.jam_selesai);
  v.tempat_pemeriksaan = teks(sesi?.tempat);
  v.catatan_perekaman = sesi?.persetujuan_ditolak
    ? "Terperiksa tidak menyetujui perekaman; pemeriksaan dilanjutkan tanpa rekaman."
    : sesi?.persetujuan_rekam
      ? "Pemeriksaan direkam atas persetujuan tertulis terperiksa."
      : "";

  // Panggilan ke-berapa: tahap yang dipilih → tahap panggilan yang sedang berjalan → sudah ada panggilan I?
  const kodeTahapPilihan = opsi.tahapanId ? (tahapan.find((t) => t.id === opsi.tahapanId)?.kode_tahap as string | undefined) : undefined;
  const panggilanJalan = tahapan.find((t) => (t.kode_tahap === "panggilan_1" || t.kode_tahap === "panggilan_2") && t.status === "berjalan")?.kode_tahap;
  const dokP = (n: 1 | 2) => dokPanggilan.find((d) => d.kode_tahap === `panggilan_${n}` || (!d.kode_tahap && d.urut === nomorRomawi(n)));
  const p1 = dokP(1);
  const p2 = dokP(2);
  const kodePanggilan = kodeTahapPilihan?.startsWith("panggilan_") ? kodeTahapPilihan : panggilanJalan ?? (p1 ? "panggilan_2" : "panggilan_1");
  v.urutan_panggilan = kodePanggilan === "panggilan_2" ? nomorRomawi(2) : nomorRomawi(1);
  v.nomor_panggilan_1 = teks(p1?.nomor);
  v.tanggal_panggilan_1 = tanggalPanjang((p1?.tanggal as string) ?? null, "");
  v.nomor_panggilan_2 = teks(p2?.nomor);
  v.tanggal_panggilan_2 = tanggalPanjang((p2?.tanggal as string) ?? null, "");

  // --- Tim pemeriksa ---
  const baris = anggota.map((a, i) => {
    const golongan = pertama(a.pg_golongan, a.golongan_ruang);
    return {
      nomor: String(i + 1),
      nama: pertama(a.nama_lengkap_gelar, a.nama_bebas),
      nip: pertama(a.nip, a.nip_bebas),
      pangkat: pangkatGolongan(a.pangkat ?? a.pangkat_gol, golongan, a.golongan_pangkat),
      jabatan: pertama(a.jabatan_tambahan, a.jabatan_fungsional, a.jabatan_bebas, a.jenis_pegawai),
      unit_kerja: teks(a.unit_kerja),
      unsur: a.unsur ? ref("unsur_tim", a.unsur) : "",
      jabatan_dalam_tim: a.jabatan_dalam_tim ? ref("jabatan_dalam_tim", a.jabatan_dalam_tim) : "",
      _peran: teks(a.jabatan_dalam_tim),
    };
  });
  const ketua = baris.find((b) => b._peran === "ketua");
  const sekretaris = baris.find((b) => b._peran === "sekretaris");
  v.anggota_tim = baris.map(({ _peran, ...r }) => (void _peran, r));
  v.nomor_sk_tim = teks(tim?.nomor_sk);
  v.tanggal_sk_tim = tanggalPanjang((tim?.tanggal_sk as string) ?? null, "");
  v.pejabat_pembentuk_tim = pertama(tim?.pejabat_pembentuk, kew.pembentuk_tim?.nama_peran);
  v.nama_ketua_tim = ketua?.nama ?? "";
  v.nip_ketua_tim = ketua?.nip ?? "";
  v.nama_sekretaris_tim = sekretaris?.nama ?? "";
  v.nip_sekretaris_tim = sekretaris?.nip ?? "";

  // --- Tanya jawab ---
  v.qa = qa.map((q, i) => ({ nomor: String(i + 1), pertanyaan: teks(q.pertanyaan), jawaban: teks(q.jawaban) }));

  // --- Pejabat ---
  const penjatuh = kew.penjatuh ?? null;
  const penjatuhRektor = penjatuh?.peran_kode === "rektor";
  // Pejabat yang dicatat pada keputusan lebih spesifik daripada nama peran generik dari aturan kewenangan.
  v.jabatan_pejabat_penjatuh = pertama(spj?.jabatan, huk?.pejabat_penjatuh, penjatuh?.nama_peran);
  v.nama_pejabat_penjatuh = pertama(spj?.nama, penjatuhRektor ? set.nama_rektor : "");
  v.nip_pejabat_penjatuh = pertama(spj?.nip, penjatuhRektor ? set.nip_rektor : "");
  const atasan = (atasanRows[0] ?? null) as Baris | null;
  v.nama_atasan_langsung = teks(atasan?.nama_lengkap_gelar);
  v.nip_atasan_langsung = teks(atasan?.nip);
  v.jabatan_atasan_langsung = pertama(atasan?.jabatan_tambahan, atasan?.jabatan_fungsional, atasan?.jenis_pegawai);

  // --- SK ---
  v.nomor_sk = teks(huk?.nomor_sk);
  v.tanggal_sk = tanggalPanjang((huk?.tanggal_sk as string) ?? null, "");
  v.tanggal_diterima = tanggalPanjang((huk?.tanggal_diterima_pegawai as string) ?? null, "");
  v.tanggal_mulai_berlaku = tanggalPanjang((huk?.tanggal_mulai_berlaku as string) ?? null, "");
  v.tanggal_selesai_hukuman = tanggalPanjang((huk?.tanggal_selesai as string) ?? null, "");
  v.durasi_hukuman = durasiBulan(((pengganti?.durasi_bulan ?? sjh?.durasi_bulan) as number | null) ?? null);
  const daftarKaidah = (k: unknown) => (Array.isArray(k) ? k.map(teks).filter(Boolean) : []);
  v.menimbang = daftarKaidah(kaidah.konsideran_menimbang).map((t, i) => ({ huruf: HURUF[i] ?? String(i + 1), teks: t }));
  v.mengingat = daftarKaidah(kaidah.konsideran_mengingat).map((t, i) => ({ nomor: String(i + 1), teks: t }));

  // --- Rekapitulasi kehadiran ---
  const perTahun = new Map<number, Map<number, number>>();
  for (const k of kehadiran) {
    const t = Number(k.tahun);
    if (!perTahun.has(t)) perTahun.set(t, new Map());
    perTahun.get(t)!.set(Number(k.bulan), Number(k.jumlah_hari) || 0);
  }
  v.rekap_tmk = [...perTahun.entries()].map(([tahun, bulan]) => {
    const row: Record<string, string> = { tahun: String(tahun) };
    let jumlah = 0;
    BULAN_KODE.forEach((b, i) => {
      const n = bulan.get(i + 1);
      row[b] = n === undefined ? "-" : String(n);
      jumlah += n ?? 0;
    });
    row.jumlah = String(jumlah);
    return row;
  });
  const tahunAcuan = Number(String(e.tanggal_peristiwa ?? hariIni).slice(0, 4));
  const tahunIni = perTahun.get(tahunAcuan);
  v.jumlah_tmk = tahunIni ? String([...tahunIni.values()].reduce((a, b) => a + b, 0)) : "";

  // --- Lain-lain ---
  v.nama_pengunduh = opsi.penggunaNama ?? "";
  v.tanggal_hari_ini = tanggalPanjang(hariIni);

  // --- Lengkapi semua placeholder katalog ---
  for (const p of katalog as unknown as Placeholder[]) {
    if (p.sumber?.startsWith("pengaturan:")) {
      v[p.kode] = teks(set[p.sumber.slice("pengaturan:".length)]);
      continue;
    }
    if (p.jenis === "loop") {
      if (!Array.isArray(v[p.kode])) v[p.kode] = [];
      continue;
    }
    if (p.sumber === "manual" && !(p.kode in v)) v[p.kode] = "";
    if (typeof v[p.kode] !== "string") v[p.kode] = "";
    // Isian tambahan kasus dengan kode yang sama (mis. diisi modul lain) menjadi cadangan.
    if (!v[p.kode] && (typeof tambahan[p.kode] === "string" || typeof tambahan[p.kode] === "number")) v[p.kode] = teks(tambahan[p.kode]);
  }
  return v;
}
