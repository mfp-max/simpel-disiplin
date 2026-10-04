// Kueri monitoring & laporan (PRD §10).
//
// KAIDAH TETAP: setiap angka progres/SLA hanya menghitung entri kelas `hukdis`
// yang `hitung_dalam_sla = true` dan tidak diarsipkan (soft delete). Entri kelas
// `informasi` dan `arsip` TIDAK pernah masuk angka-angka itu — `informasi`
// ditampilkan terpisah, `arsip` hanya muncul sebagai statistik historis.
//
// Berkas ini sengaja tanpa "server-only" agar bisa diuji dari skrip
// (scripts/uji-laporan.ts); tetap hanya diimpor dari kode server.

import { sql, type Sql } from "@/lib/db";
import { geserHari, hariIni as hariIniWib, selisihHariKerja, type Kalender } from "@/lib/hari-kerja";
import { statusTenggat } from "@/lib/tenggat";
import { muatAturan, muatKalender, resolveRegulasi } from "@/lib/regulasi";
import { ambangBerikutnya, hitungAmbangKehadiran, hitungTanggalTenggat } from "@/lib/hukdis/mesin";
import type { AturanLengkap } from "@/lib/hukdis/jenis";
import type { StatusTenggat } from "@/components/simpel/lencana";
import { labelKode, namaBulan, tanggalPanjang, tanggalPendek } from "@/lib/format";

// ---------------------------------------------------------------------------
// Fragmen SQL bersama
// ---------------------------------------------------------------------------

/** Entri yang dihitung dalam progres/SLA: hanya hukdis, ikut SLA, tidak diarsipkan. Alias tabel entri wajib `e`. */
export function dihitung(db: Sql) {
  return db`e.kelas = 'hukdis' and e.hitung_dalam_sla and e.diarsipkan_pada is null`;
}

/** Label unit kerja tingkat fakultas/direktorat (salinan beku lebih dulu). Butuh alias p, uk, uki. */
function labelUnit(db: Sql) {
  return db`coalesce(
    nullif(e.snapshot_pegawai->>'direktorat_fakultas', ''), nullif(p.direktorat_fakultas, ''),
    uki.nama, uk.nama, nullif(e.snapshot_pegawai->>'unit_kerja', ''), nullif(p.unit_kerja, ''), nullif(e.unit_kerja_bebas, ''),
    'Tidak diketahui')`;
}

function joinPegawaiUnit(db: Sql) {
  return db`left join pegawai p on p.id = e.pegawai_id
    left join unit_kerja uk on uk.id = coalesce(e.unit_kerja_id, p.unit_kerja_id)
    left join unit_kerja uki on uki.id = uk.induk_id`;
}

function namaPegawai(db: Sql) {
  return db`coalesce(e.snapshot_pegawai->>'nama_lengkap_gelar', p.nama_lengkap_gelar, e.nama_pegawai_bebas, '—')`;
}

function nipPegawai(db: Sql) {
  return db`coalesce(e.snapshot_pegawai->>'nip', p.nip, e.nip_bebas)`;
}

async function bacaPengaturan<T>(db: Sql, kunci: string, bawaan: T): Promise<T> {
  const [r] = await db`select nilai from pengaturan where kunci = ${kunci}`;
  const v = r?.nilai;
  return (v === undefined || v === null || v === "" ? bawaan : v) as T;
}

function angkaAman(v: unknown, bawaan: number) {
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? n : bawaan;
}

const tahunDari = (t: string) => Number(t.slice(0, 4));

// ---------------------------------------------------------------------------
// BERANDA
// ---------------------------------------------------------------------------

export type KartuKasus = {
  id: string;
  nomor: string;
  judul: string;
  nama: string;
  tingkat: string | null;
  tahap: string | null;
  tenggat: StatusTenggat | null;
};

export type KolomKanban = { kode: string; nama: string; jumlah: number; kasus: KartuKasus[] };

export type ItemTenggat = {
  tahapId: string;
  entriId: string;
  nomor: string;
  judul: string;
  nama: string;
  tahap: string;
  namaTenggat: string | null;
  tanggal: string;
  status: StatusTenggat;
  sifat: "wajib_hukum" | "pengingat_internal";
  pasal: string | null;
};

export type TitikGrafik = { label: string; nilai: number; kunci?: string };

export type PegawaiDekatAmbang = {
  pegawaiId: string;
  nama: string;
  nip: string | null;
  unit: string | null;
  total: number;
  berturut: number | null;
  regulasi: string;
  saatIni: { tingkat: string | null; jenis: string | null } | null;
  berikut: { hariMin: number; tingkat: string | null; jenis: string | null };
  selisih: number;
};

export type DataBeranda = {
  hariIni: string;
  ambangHari: number;
  ringkasan: { aktif: number; mendekati: number; lewat: number; informasi: number; selesaiTahunIni: number; arsip: number };
  kanban: KolomKanban[];
  tenggat: ItemTenggat[];
  tenggatTotal: number;
  grafik: { tingkat: TitikGrafik[]; unit: TitikGrafik[]; rezim: TitikGrafik[]; tren: TitikGrafik[]; totalKasus: number };
  kehadiran: { daftar: PegawaiDekatAmbang[]; margin: number; tahun: number; peringatan: string[] };
};

const MAKS_KARTU_KOLOM = 8;
const HARI_DEPAN = 14;

type TahapTerbuka = {
  id: string; entri_id: string; nama: string; status: string; tenggat: string | null; tenggat_info: Record<string, unknown> | null; urutan: number;
};

/** Tahap yang masih terbuka pada kasus hukdis berjalan (opsional yang belum diaktifkan tidak dihitung). */
async function tahapTerbuka(db: Sql) {
  return (await db`
    select t.id, t.entri_id, t.nama, t.status, t.tenggat, t.tenggat_info, t.urutan
    from tahapan_kasus t
    join entri e on e.id = t.entri_id
    join status_kasus s on s.kode = e.status_kasus and s.kelompok = 'berjalan'
    where ${dihitung(db)}
      and t.status in ('belum', 'berjalan')
      and not (t.opsional and t.status = 'belum')
    order by t.entri_id, t.urutan`) as unknown as TahapTerbuka[];
}

const peringkatWarna = { lewat: 3, waspada: 2, aman: 1, selesai: 0 } as const;

export async function ambilBeranda(db: Sql = sql, opsi: { hariIni?: string } = {}): Promise<DataBeranda> {
  const hari = opsi.hariIni ?? hariIniWib();
  const tahun = tahunDari(hari);
  const [kal, ambangMentah, marginMentah] = await Promise.all([
    muatKalender(db),
    bacaPengaturan(db, "ambang_peringatan_tenggat_hari", 3),
    bacaPengaturan(db, "ambang_dekat_kehadiran_hari", 2),
  ]);
  const ambangHari = angkaAman(ambangMentah, 3);

  const [kolomStatus, kasusBerjalan, tahap, [hitungan], grafik, kehadiran] = await Promise.all([
    db`select kode, nama from status_kasus where kelompok = 'berjalan' order by urutan`,
    db`
      select e.id, e.nomor_registrasi, e.judul, e.status_kasus, ${namaPegawai(db)} as nama, th.nama as tingkat
      from entri e
      join status_kasus s on s.kode = e.status_kasus and s.kelompok = 'berjalan'
      left join pegawai p on p.id = e.pegawai_id
      left join tingkat_hukuman th on th.id = e.tingkat_hukuman_dugaan_id
      where ${dihitung(db)}
      order by e.created_at`,
    tahapTerbuka(db),
    db`
      select
        (select count(*)::int from entri e where e.kelas = 'informasi' and e.status_kasus = 'informasi' and e.diarsipkan_pada is null) as informasi,
        (select count(*)::int from entri e join status_kasus s on s.kode = e.status_kasus and s.kelompok = 'selesai'
           where ${dihitung(db)} and extract(year from coalesce(e.tanggal_selesai, (e.updated_at at time zone 'Asia/Jakarta')::date)) = ${tahun}) as selesai,
        (select count(*)::int from entri e where e.kelas = 'arsip' and e.diarsipkan_pada is null) as arsip`,
    ambilGrafik(db, hari),
    pegawaiDekatAmbang(db, hari, angkaAman(marginMentah, 2)),
  ]);

  // Status tenggat per tahap, tahap berjalan per kasus
  const perKasus = new Map<string, { tahap: string | null; terburuk: StatusTenggat | null }>();
  const daftarTenggat: ItemTenggat[] = [];
  const batasDepan = geserHari(hari, HARI_DEPAN);
  const infoKasus = new Map(kasusBerjalan.map((k) => [k.id as string, k]));
  let mendekati = 0;
  let lewat = 0;

  for (const t of tahap) {
    const st = statusTenggat(t.tenggat, hari, kal, ambangHari);
    const isi = perKasus.get(t.entri_id) ?? { tahap: null, terburuk: null };
    if (!isi.tahap && t.status === "berjalan") isi.tahap = t.nama;
    if (st && (!isi.terburuk || peringkatWarna[st.warna] > peringkatWarna[isi.terburuk.warna])) isi.terburuk = st;
    perKasus.set(t.entri_id, isi);
    const k = infoKasus.get(t.entri_id);
    if (st && k && t.tenggat && (st.warna === "lewat" || t.tenggat <= batasDepan)) {
      daftarTenggat.push({
        tahapId: t.id, entriId: t.entri_id, nomor: k.nomor_registrasi, judul: k.judul, nama: k.nama, tahap: t.nama,
        namaTenggat: (t.tenggat_info?.nama as string) ?? null, tanggal: t.tenggat, status: st,
        sifat: t.tenggat_info?.sifat === "pengingat_internal" ? "pengingat_internal" : "wajib_hukum",
        pasal: (t.tenggat_info?.pasal as string) ?? null,
      });
    }
  }
  for (const v of perKasus.values()) {
    if (v.terburuk?.warna === "lewat") lewat += 1;
    else if (v.terburuk?.warna === "waspada") mendekati += 1;
  }
  daftarTenggat.sort((a, b) => a.tanggal.localeCompare(b.tanggal));

  const kanban: KolomKanban[] = kolomStatus.map((s) => {
    const semua = kasusBerjalan.filter((k) => k.status_kasus === s.kode);
    return {
      kode: s.kode, nama: s.nama, jumlah: semua.length,
      kasus: semua.slice(0, MAKS_KARTU_KOLOM).map((k) => ({
        id: k.id, nomor: k.nomor_registrasi, judul: k.judul, nama: k.nama, tingkat: k.tingkat ?? null,
        tahap: perKasus.get(k.id)?.tahap ?? null, tenggat: perKasus.get(k.id)?.terburuk ?? null,
      })),
    };
  });

  return {
    hariIni: hari,
    ambangHari,
    ringkasan: { aktif: kasusBerjalan.length, mendekati, lewat, informasi: hitungan.informasi, selesaiTahunIni: hitungan.selesai, arsip: hitungan.arsip },
    kanban,
    tenggat: daftarTenggat.slice(0, 15),
    tenggatTotal: daftarTenggat.length,
    grafik,
    kehadiran,
  };
}

async function ambilGrafik(db: Sql, hari: string): Promise<DataBeranda["grafik"]> {
  const bulanIni = `${hari.slice(0, 7)}-01`;
  const [tingkat, unit, rezim, tren, [{ total }]] = await Promise.all([
    db`select coalesce(min(th.nama), 'Belum ditentukan') as label, count(*)::int as nilai, min(th.urutan) as urut
       from entri e left join tingkat_hukuman th on th.id = e.tingkat_hukuman_dugaan_id
       where ${dihitung(db)}
       group by lower(coalesce(th.nama, '')) order by urut nulls last`,
    db`select ${labelUnit(db)} as label, count(*)::int as nilai
       from entri e ${joinPegawaiUnit(db)}
       where ${dihitung(db)}
       group by 1 order by 2 desc, 1`,
    db`select coalesce(rz.nama, 'Rezim belum ditentukan') as label, e.rezim_kode as kunci, count(*)::int as nilai
       from entri e left join rezim rz on rz.kode = e.rezim_kode
       where ${dihitung(db)}
       group by rz.nama, e.rezim_kode, rz.urutan order by rz.urutan nulls last`,
    db`with b as (
         select to_char(g, 'YYYY-MM') as bulan
         from generate_series(${bulanIni}::date - interval '11 months', ${bulanIni}::date, interval '1 month') g
       )
       select b.bulan, count(e.id)::int as nilai
       from b left join entri e
         on to_char(e.created_at at time zone 'Asia/Jakarta', 'YYYY-MM') = b.bulan and ${dihitung(db)}
       group by b.bulan order by b.bulan`,
    db`select count(*)::int as total from entri e where ${dihitung(db)}`,
  ]);
  const unitTop: TitikGrafik[] = unit.slice(0, 10).map((u) => ({ label: u.label, nilai: u.nilai }));
  const sisa = unit.slice(10).reduce((s, u) => s + (u.nilai as number), 0);
  if (sisa) unitTop.push({ label: `Lainnya (${unit.length - 10} unit)`, nilai: sisa });
  return {
    tingkat: tingkat.map((t) => ({ label: labelKode(t.label), nilai: t.nilai })),
    unit: unitTop,
    rezim: rezim.map((r) => ({ label: r.label, nilai: r.nilai, kunci: r.kunci ?? undefined })),
    tren: tren.map((t) => {
      const [y, m] = String(t.bulan).split("-").map(Number);
      return { label: `${namaBulan(m).slice(0, 3)} ${String(y).slice(2)}`, kunci: `${namaBulan(m)} ${y}`, nilai: t.nilai };
    }),
    totalKasus: total,
  };
}

/** Pegawai dengan akumulasi TMK tahun berjalan yang tinggal ≤ margin hari dari ambang berikutnya. */
export async function pegawaiDekatAmbang(db: Sql, hari: string, margin: number): Promise<DataBeranda["kehadiran"]> {
  const tahun = tahunDari(hari);
  const rows = await db`
    select p.id, p.nama_lengkap_gelar, p.nip, p.unit_kerja, coalesce(p.rezim_kode, m.rezim_kode) as rezim,
      sum(c.jumlah_hari)::int as total, max(c.berturut_maks)::int as berturut
    from catatan_kehadiran c
    join pegawai p on p.id = c.pegawai_id
    left join pemetaan_status_pegawai m on lower(m.status_pegawai) = lower(p.status_pegawai)
    where c.tahun = ${tahun} and p.diarsipkan_pada is null
    group by p.id, m.rezim_kode`;
  const peringatan: string[] = [];
  const aturanPerRezim = new Map<string, AturanLengkap | null>();
  for (const rezim of new Set(rows.map((r) => r.rezim as string | null).filter((x): x is string => !!x))) {
    const res = await resolveRegulasi(rezim, hari, db);
    if (res.status === "tunggal") aturanPerRezim.set(rezim, await muatAturan(res.regulasi.id, db));
    else {
      aturanPerRezim.set(rezim, null);
      peringatan.push(`Rezim ${rezim}: ${res.pesan}`);
    }
  }
  const tanpaRezim = rows.filter((r) => !r.rezim).length;
  if (tanpaRezim) peringatan.push(`${tanpaRezim} pegawai dengan catatan kehadiran belum dipetakan ke rezim sehingga tidak dapat dinilai.`);

  const daftar: PegawaiDekatAmbang[] = [];
  for (const r of rows) {
    const a = r.rezim ? aturanPerRezim.get(r.rezim) : null;
    if (!a) continue;
    const berikut = ambangBerikutnya(a, r.total);
    if (!berikut) continue;
    const selisih = berikut.ambang.hari_min - r.total;
    if (selisih > margin) continue;
    const kini = hitungAmbangKehadiran(a, r.total, r.berturut);
    daftar.push({
      pegawaiId: r.id, nama: r.nama_lengkap_gelar, nip: r.nip, unit: r.unit_kerja, total: r.total, berturut: r.berturut,
      regulasi: a.regulasi.nama_singkat,
      saatIni: kini ? { tingkat: kini.tingkat?.nama ?? null, jenis: kini.jenisEfektif?.nama ?? kini.jenis?.nama ?? null } : null,
      berikut: { hariMin: berikut.ambang.hari_min, tingkat: berikut.tingkat?.nama ?? null, jenis: berikut.jenisEfektif?.nama ?? berikut.jenis?.nama ?? null },
      selisih,
    });
  }
  daftar.sort((p, q) => p.selisih - q.selisih || q.total - p.total);
  return { daftar, margin, tahun, peringatan };
}

// ---------------------------------------------------------------------------
// LAPORAN
// ---------------------------------------------------------------------------

export type JenisKolom = "teks" | "pii" | "tanggal" | "angka" | "persen" | "ya_tidak" | "tenggat" | "panjang";
export type Kolom = { kunci: string; judul: string; jenis?: JenisKolom };
export type Baris = Record<string, unknown>;
export type Lembar = { nama: string; judul: string; kolom: Kolom[]; baris: Baris[]; utama?: boolean; catatan?: string; tautan?: string };
export type ItemRingkasan = { label: string; nilai: string; pii?: boolean; warna?: "aman" | "waspada" | "lewat" | "info" };
export type HasilLaporan = { lembar: Lembar[]; ringkasan: ItemRingkasan[]; keteranganFilter: string[] };

export type FilterLaporan = {
  dari?: string; sampai?: string; unit?: string; tingkat?: string; rezim?: string; status?: string; pegawai?: string; blokir?: string;
};
export type KunciFilter = keyof FilterLaporan;

export type DefLaporan = {
  kode: string;
  judul: string;
  singkat: string;
  deskripsi: string;
  filter: KunciFilter[];
  labelTanggal?: string;
  wajibPegawai?: boolean;
};

export const DAFTAR_LAPORAN: DefLaporan[] = [
  {
    kode: "rekapitulasi", judul: "Rekapitulasi hukuman disiplin", singkat: "Rekap hukuman",
    deskripsi: "Jumlah hukuman disiplin yang dijatuhkan per periode, per unit kerja, dan per tingkat, beserta rinciannya.",
    filter: ["dari", "sampai", "unit", "tingkat", "rezim"], labelTanggal: "Tanggal SK",
  },
  {
    kode: "kasus-berjalan", judul: "Daftar kasus berjalan", singkat: "Kasus berjalan",
    deskripsi: "Kasus hukuman disiplin yang sedang diproses, posisi tahapannya, tenggat, dan penanggung jawab.",
    filter: ["rezim", "unit", "status"],
  },
  {
    kode: "riwayat-pegawai", judul: "Riwayat hukuman disiplin per pegawai", singkat: "Riwayat pegawai",
    deskripsi: "Seluruh riwayat kasus, hukuman disiplin, arsip lampau, dan pembinaan seorang pegawai — bahan pembinaan dan penilaian.",
    filter: ["pegawai"], wajibPegawai: true,
  },
  {
    kode: "menjalani-hukuman", judul: "Pegawai yang sedang menjalani hukuman", singkat: "Sedang menjalani",
    deskripsi: "Pegawai yang hari ini berada dalam masa hukuman — bahan blokir kenaikan gaji berkala/kenaikan pangkat dan pemotongan insentif kinerja.",
    filter: ["rezim", "unit", "blokir"],
  },
  {
    kode: "kepatuhan-tenggat", judul: "Rekap kepatuhan tenggat", singkat: "Kepatuhan tenggat",
    deskripsi: "Persentase tahapan yang diselesaikan tepat waktu (tanggal realisasi tidak melewati tenggat), per bulan dan per tahap.",
    filter: ["dari", "sampai", "rezim"], labelTanggal: "Tanggal tenggat",
  },
];

export function cariLaporan(kode: string) {
  return DAFTAR_LAPORAN.find((d) => d.kode === kode) ?? null;
}

const POLA_TANGGAL = /^\d{4}-\d{2}-\d{2}$/;
const POLA_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Membaca filter dari parameter URL — nilai tidak valid diabaikan. */
export function bacaFilter(sp: URLSearchParams | Record<string, string | string[] | undefined>): FilterLaporan {
  const ambil = (k: string) => {
    const v = sp instanceof URLSearchParams ? sp.get(k) : sp[k];
    const s = Array.isArray(v) ? v[0] : v;
    return s?.trim() ? s.trim().slice(0, 200) : undefined;
  };
  const f: FilterLaporan = {};
  const dari = ambil("dari");
  const sampai = ambil("sampai");
  if (dari && POLA_TANGGAL.test(dari)) f.dari = dari;
  if (sampai && POLA_TANGGAL.test(sampai)) f.sampai = sampai;
  for (const k of ["unit", "tingkat", "rezim", "status"] as const) {
    const v = ambil(k);
    if (v) f[k] = v;
  }
  const pg = ambil("pegawai");
  if (pg && POLA_UUID.test(pg)) f.pegawai = pg;
  const bl = ambil("blokir");
  if (bl && ["kgb", "kp", "ik"].includes(bl)) f.blokir = bl;
  return f;
}

/** Filter → parameter URL (untuk tautan ekspor & paginasi). */
export function filterKeParam(f: FilterLaporan) {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(f)) if (v) p.set(k, v);
  return p;
}

export const LABEL_BLOKIR: Record<string, string> = {
  kgb: "Blokir kenaikan gaji berkala",
  kp: "Blokir kenaikan pangkat",
  ik: "Pemotongan insentif kinerja",
};

export type OpsiFilter = {
  unit: string[];
  tingkat: string[];
  rezim: { kode: string; nama: string }[];
  status: { kode: string; nama: string }[];
};

export async function opsiFilter(db: Sql = sql): Promise<OpsiFilter> {
  const [unit, tingkat, rezim, status] = await Promise.all([
    db`select distinct ${labelUnit(db)} as label from entri e ${joinPegawaiUnit(db)} where ${dihitung(db)} order by 1`,
    db`select min(nama) as nama from tingkat_hukuman group by lower(nama) order by min(urutan), 1`,
    db`select kode, nama from rezim where aktif order by urutan`,
    db`select kode, nama from status_kasus where kelompok = 'berjalan' order by urutan`,
  ]);
  return {
    unit: unit.map((u) => u.label as string),
    tingkat: tingkat.map((t) => labelKode(t.nama as string)),
    rezim: rezim as unknown as OpsiFilter["rezim"],
    status: status as unknown as OpsiFilter["status"],
  };
}

async function keteranganFilter(db: Sql, def: DefLaporan, f: FilterLaporan) {
  const k: string[] = [];
  if (f.dari || f.sampai) k.push(`${def.labelTanggal ?? "Periode"}: ${f.dari ? tanggalPendek(f.dari) : "awal"} s.d. ${f.sampai ? tanggalPendek(f.sampai) : "sekarang"}`);
  if (f.unit) k.push(`Unit kerja: ${f.unit}`);
  if (f.tingkat) k.push(`Tingkat: ${f.tingkat}`);
  if (f.rezim) {
    const [r] = await db`select nama from rezim where kode = ${f.rezim}`;
    k.push(`Rezim: ${r?.nama ?? f.rezim}`);
  }
  if (f.status) {
    const [s] = await db`select nama from status_kasus where kode = ${f.status}`;
    k.push(`Status: ${s?.nama ?? f.status}`);
  }
  if (f.blokir) k.push(`Akibat: ${LABEL_BLOKIR[f.blokir]}`);
  if (!k.length) k.push("Tanpa filter (seluruh data)");
  return k;
}

export async function jalankanLaporan(kode: string, f: FilterLaporan, db: Sql = sql, opsi: { hariIni?: string } = {}): Promise<HasilLaporan | null> {
  const def = cariLaporan(kode);
  if (!def) return null;
  const hari = opsi.hariIni ?? hariIniWib();
  const ket = await keteranganFilter(db, def, f);
  let hasil: Omit<HasilLaporan, "keteranganFilter">;
  switch (def.kode) {
    case "rekapitulasi": hasil = await laporanRekap(db, f); break;
    case "kasus-berjalan": hasil = await laporanKasusBerjalan(db, f, hari); break;
    case "riwayat-pegawai": hasil = await laporanRiwayat(db, f); break;
    case "menjalani-hukuman": hasil = await laporanMenjalani(db, f, hari); break;
    case "kepatuhan-tenggat": hasil = await laporanKepatuhan(db, f, hari); break;
    default: return null;
  }
  return { ...hasil, keteranganFilter: ket };
}

const kosong = (db: Sql) => db``;
type IsiLaporan = Omit<HasilLaporan, "keteranganFilter">;

// (a) Rekapitulasi hukuman disiplin ------------------------------------------
async function laporanRekap(db: Sql, f: FilterLaporan): Promise<IsiLaporan> {
  const acuan = db`coalesce(h.tanggal_sk, e.tanggal_peristiwa)`;
  const tingkatExpr = db`coalesce(h.snapshot_jenis_hukuman->>'tingkat', th.nama, 'Tidak diketahui')`;
  const rows = await db`
    select e.id, e.nomor_registrasi, ${namaPegawai(db)} as nama, ${nipPegawai(db)} as nip, ${labelUnit(db)} as unit,
      coalesce(e.snapshot_regulasi->>'nama_singkat', r.nama_singkat) as regulasi, rz.nama as rezim,
      ${tingkatExpr} as tingkat, coalesce(ts.urutan, th.urutan, 99) as urut_tingkat,
      h.snapshot_jenis_hukuman->>'nama' as jenis, h.snapshot_jenis_hukuman->'pengganti_sementara'->>'nama' as pengganti,
      h.nomor_sk, h.tanggal_sk, h.tanggal_mulai_berlaku, h.tanggal_selesai, h.pemotongan_ik, ${acuan} as tanggal_acuan
    from hukuman h
    join entri e on e.id = h.entri_id
    ${joinPegawaiUnit(db)}
    left join regulasi r on r.id = e.regulasi_id
    left join rezim rz on rz.kode = e.rezim_kode
    left join tingkat_hukuman th on th.id = e.tingkat_hukuman_dugaan_id
    left join tingkat_hukuman ts on ts.regulasi_id = e.regulasi_id and ts.kode = h.snapshot_jenis_hukuman->>'tingkat_kode'
    where ${dihitung(db)}
      ${f.dari ? db`and ${acuan} >= ${f.dari}` : kosong(db)}
      ${f.sampai ? db`and ${acuan} <= ${f.sampai}` : kosong(db)}
      ${f.unit ? db`and ${labelUnit(db)} = ${f.unit}` : kosong(db)}
      ${f.tingkat ? db`and lower(${tingkatExpr}) = lower(${f.tingkat})` : kosong(db)}
      ${f.rezim ? db`and e.rezim_kode = ${f.rezim}` : kosong(db)}
    order by ${acuan} desc nulls last, e.nomor_registrasi`;

  // Urutan kolom tingkat mengikuti urutan katalog
  const urut = new Map<string, number>();
  for (const r of rows) {
    const t = labelKode(r.tingkat);
    urut.set(t, Math.min(urut.get(t) ?? 99, r.urut_tingkat));
  }
  const daftarTingkat = [...urut.entries()].sort((a, b) => a[1] - b[1]).map(([t]) => t);
  const kunciT = (t: string) => `t_${daftarTingkat.indexOf(t)}`;
  const kolomTingkat: Kolom[] = daftarTingkat.map((t) => ({ kunci: kunciT(t), judul: t, jenis: "angka" }));

  function pivot(kunciBaris: (r: Baris) => string, judulBaris: string, urutkan: (a: string, b: string) => number, labelBaris?: (k: string) => string) {
    const m = new Map<string, Baris>();
    for (const r of rows) {
      const k = kunciBaris(r);
      const b = m.get(k) ?? { label: labelBaris ? labelBaris(k) : k, total: 0, ...Object.fromEntries(daftarTingkat.map((t) => [kunciT(t), 0])) };
      b[kunciT(labelKode(r.tingkat))] = (b[kunciT(labelKode(r.tingkat))] as number) + 1;
      b.total = (b.total as number) + 1;
      m.set(k, b);
    }
    const baris = [...m.entries()].sort((a, b) => urutkan(a[0], b[0])).map(([, v]) => v);
    if (baris.length) {
      const jumlah: Baris = { label: "Jumlah", total: rows.length };
      for (const t of daftarTingkat) jumlah[kunciT(t)] = baris.reduce((s, b) => s + (b[kunciT(t)] as number), 0);
      baris.push(jumlah);
    }
    return { kolom: [{ kunci: "label", judul: judulBaris }, ...kolomTingkat, { kunci: "total", judul: "Jumlah", jenis: "angka" as const }], baris };
  }

  const perUnit = pivot((r) => String(r.unit), "Unit kerja", (a, b) => a.localeCompare(b, "id"));
  const perBulan = pivot(
    (r) => (r.tanggal_acuan ? String(r.tanggal_acuan).slice(0, 7) : "0000-00"),
    "Bulan",
    (a, b) => a.localeCompare(b),
    (k) => (k === "0000-00" ? "Tanpa tanggal" : `${namaBulan(Number(k.slice(5, 7)))} ${k.slice(0, 4)}`),
  );

  const rincian: Lembar = {
    nama: "Rincian", judul: "Rincian hukuman disiplin", utama: true,
    kolom: [
      { kunci: "nomor_registrasi", judul: "Nomor registrasi" },
      { kunci: "nama", judul: "Nama pegawai", jenis: "pii" },
      { kunci: "nip", judul: "NIP", jenis: "pii" },
      { kunci: "unit", judul: "Unit kerja" },
      { kunci: "rezim", judul: "Rezim" },
      { kunci: "regulasi", judul: "Peraturan" },
      { kunci: "tingkat", judul: "Tingkat" },
      { kunci: "jenis", judul: "Jenis hukuman disiplin", jenis: "panjang" },
      { kunci: "pengganti", judul: "Dijalankan sementara sebagai", jenis: "panjang" },
      { kunci: "nomor_sk", judul: "Nomor SK" },
      { kunci: "tanggal_sk", judul: "Tanggal SK", jenis: "tanggal" },
      { kunci: "tanggal_mulai_berlaku", judul: "Mulai berlaku", jenis: "tanggal" },
      { kunci: "tanggal_selesai", judul: "Selesai", jenis: "tanggal" },
      { kunci: "pemotongan_ik", judul: "Pemotongan IK", jenis: "ya_tidak" },
    ],
    baris: rows.map((r): Baris => ({ ...r, tingkat: labelKode(r.tingkat), tautan: `/kasus/${r.id}` })),
    tautan: "tautan",
  };

  return {
    ringkasan: [
      { label: "Hukuman disiplin", nilai: String(rows.length) },
      ...daftarTingkat.map((t) => ({ label: t, nilai: String(rows.filter((r) => labelKode(r.tingkat) === t).length) })),
    ],
    lembar: [
      { nama: "Per unit kerja", judul: "Rekap per unit kerja dan tingkat", ...perUnit },
      { nama: "Per bulan", judul: "Rekap per bulan (tanggal SK) dan tingkat", ...perBulan },
      rincian,
    ],
  };
}

// (b) Daftar kasus berjalan ---------------------------------------------------
async function laporanKasusBerjalan(db: Sql, f: FilterLaporan, hari: string): Promise<IsiLaporan> {
  const [kal, ambangMentah] = await Promise.all([muatKalender(db), bacaPengaturan(db, "ambang_peringatan_tenggat_hari", 3)]);
  const ambang = angkaAman(ambangMentah, 3);
  const rows = await db`
    select e.id, e.nomor_registrasi, e.judul, ${namaPegawai(db)} as nama, ${nipPegawai(db)} as nip, ${labelUnit(db)} as unit,
      rz.nama as rezim, coalesce(e.snapshot_regulasi->>'nama_singkat', r.nama_singkat) as regulasi, th.nama as tingkat,
      s.nama as status, tj.nama as tahap, tj.tenggat, tj.tenggat_info->>'sifat' as sifat,
      u.nama as pj_kasus, ut.nama as pj_tahap, e.created_at
    from entri e
    join status_kasus s on s.kode = e.status_kasus and s.kelompok = 'berjalan'
    ${joinPegawaiUnit(db)}
    left join regulasi r on r.id = e.regulasi_id
    left join rezim rz on rz.kode = e.rezim_kode
    left join tingkat_hukuman th on th.id = e.tingkat_hukuman_dugaan_id
    left join app_users u on u.id = e.pic_user_id
    left join lateral (
      select t.nama, t.tenggat, t.tenggat_info, t.pic_user_id from tahapan_kasus t
      where t.entri_id = e.id and t.status = 'berjalan' order by t.urutan limit 1
    ) tj on true
    left join app_users ut on ut.id = tj.pic_user_id
    where ${dihitung(db)}
      ${f.rezim ? db`and e.rezim_kode = ${f.rezim}` : kosong(db)}
      ${f.status ? db`and e.status_kasus = ${f.status}` : kosong(db)}
      ${f.unit ? db`and ${labelUnit(db)} = ${f.unit}` : kosong(db)}
    order by s.urutan, e.created_at`;
  const baris = rows.map((r): Baris => ({
    ...r,
    tingkat: r.tingkat ? labelKode(r.tingkat) : null,
    sisa: statusTenggat(r.tenggat, hari, kal, ambang),
    sifat: r.sifat === "pengingat_internal" ? "Pengingat internal" : r.sifat ? "Wajib hukum" : null,
    tercatat: r.created_at instanceof Date ? r.created_at.toISOString().slice(0, 10) : null,
    tautan: `/kasus/${r.id}`,
  }));
  const lewat = baris.filter((b) => (b.sisa as StatusTenggat | null)?.warna === "lewat").length;
  const dekat = baris.filter((b) => (b.sisa as StatusTenggat | null)?.warna === "waspada").length;
  return {
    ringkasan: [
      { label: "Kasus berjalan", nilai: String(baris.length) },
      { label: "Tahap lewat tenggat", nilai: String(lewat), warna: lewat ? "lewat" as const : undefined },
      { label: `Mendekati tenggat (≤ ${ambang} hari kerja)`, nilai: String(dekat), warna: dekat ? "waspada" as const : undefined },
    ],
    lembar: [{
      nama: "Kasus berjalan", judul: "Kasus berjalan, posisi tahapan, dan penanggung jawab", utama: true, tautan: "tautan",
      kolom: [
        { kunci: "nomor_registrasi", judul: "Nomor registrasi" },
        { kunci: "judul", judul: "Judul kasus", jenis: "panjang" },
        { kunci: "nama", judul: "Pegawai terlapor", jenis: "pii" },
        { kunci: "nip", judul: "NIP", jenis: "pii" },
        { kunci: "unit", judul: "Unit kerja" },
        { kunci: "rezim", judul: "Rezim" },
        { kunci: "regulasi", judul: "Peraturan" },
        { kunci: "tingkat", judul: "Dugaan tingkat" },
        { kunci: "status", judul: "Status" },
        { kunci: "tahap", judul: "Tahap berjalan" },
        { kunci: "tenggat", judul: "Tenggat tahap", jenis: "tanggal" },
        { kunci: "sisa", judul: "Sisa waktu", jenis: "tenggat" },
        { kunci: "sifat", judul: "Sifat tenggat" },
        { kunci: "pj_kasus", judul: "Penanggung jawab kasus" },
        { kunci: "pj_tahap", judul: "Penanggung jawab tahap" },
        { kunci: "tercatat", judul: "Tercatat", jenis: "tanggal" },
      ] satisfies Kolom[],
      baris,
    }],
  };
}

// (c) Riwayat hukuman disiplin per pegawai ------------------------------------
async function laporanRiwayat(db: Sql, f: FilterLaporan): Promise<IsiLaporan> {
  if (!f.pegawai) return { ringkasan: [], lembar: [] };
  const [pg] = await db`select id, nama_lengkap_gelar, nip, unit_kerja, status_pegawai, golongan_ruang,
      coalesce(nullif(jabatan_tambahan, ''), nullif(jabatan_fungsional, ''), jenis_pegawai) as jabatan
    from pegawai where id = ${f.pegawai}`;
  if (!pg) return { ringkasan: [{ label: "Pegawai", nilai: "Tidak ditemukan" }], lembar: [] };
  const rows = await db`
    select e.id, e.kelas, k.nama as kelas_nama, e.nomor_registrasi, e.judul, e.tanggal_peristiwa, e.tahun_peristiwa,
      coalesce(e.snapshot_regulasi->>'nama_singkat', r.nama_singkat) as regulasi, s.nama as status,
      coalesce(h.snapshot_jenis_hukuman->>'tingkat', thj.nama, th.nama) as tingkat,
      coalesce(h.snapshot_jenis_hukuman->>'nama', jh.nama, kr.label) as jenis,
      h.snapshot_jenis_hukuman->'pengganti_sementara'->>'nama' as pengganti,
      h.snapshot_jenis_hukuman is null and jh.nama is not null as dari_katalog,
      h.nomor_sk, h.tanggal_sk, h.tanggal_mulai_berlaku, h.tanggal_selesai, e.created_at
    from entri e
    join kelas_entri k on k.kode = e.kelas
    join status_kasus s on s.kode = e.status_kasus
    left join regulasi r on r.id = e.regulasi_id
    left join hukuman h on h.entri_id = e.id
    left join tingkat_hukuman th on th.id = e.tingkat_hukuman_dugaan_id
    left join jenis_hukuman jh on jh.id = e.jenis_hukuman_id
    left join tingkat_hukuman thj on thj.id = jh.tingkat_hukuman_id
    left join kode_referensi kr on kr.kategori = 'jenis_non_hukdis' and kr.kode = e.jenis_non_hukdis
    where e.pegawai_id = ${f.pegawai} and e.kelas in ('hukdis', 'arsip', 'non_hukdis') and e.diarsipkan_pada is null
    order by coalesce(e.tanggal_peristiwa, make_date(coalesce(e.tahun_peristiwa, 1900), 1, 1)) desc, e.created_at desc`;
  const baris = rows.map((r): Baris => ({
    ...r,
    waktu: r.tanggal_peristiwa ? tanggalPendek(r.tanggal_peristiwa) : r.tahun_peristiwa ? String(r.tahun_peristiwa) : "—",
    tingkat: r.tingkat ? labelKode(r.tingkat) : null,
    jenis: r.jenis ? `${r.jenis}${r.dari_katalog ? " (dari katalog)" : ""}` : null,
    tautan: r.kelas === "hukdis" ? `/kasus/${r.id}` : r.kelas === "arsip" ? `/arsip/${r.id}` : `/pembinaan/${r.id}`,
  }));
  const hukdis = baris.filter((b) => b.kelas !== "non_hukdis");
  const pembinaan = baris.filter((b) => b.kelas === "non_hukdis");
  const kolomDasar: Kolom[] = [
    { kunci: "kelas_nama", judul: "Kelas" },
    { kunci: "nomor_registrasi", judul: "Nomor registrasi" },
    { kunci: "waktu", judul: "Waktu peristiwa" },
    { kunci: "judul", judul: "Uraian", jenis: "panjang" },
    { kunci: "regulasi", judul: "Peraturan" },
    { kunci: "status", judul: "Status" },
  ];
  return {
    ringkasan: [
      { label: "Pegawai", nilai: pg.nama_lengkap_gelar, pii: true },
      { label: "NIP", nilai: pg.nip ?? "—", pii: true },
      { label: "Unit kerja", nilai: pg.unit_kerja ?? "—" },
      { label: "Hukuman disiplin & arsip", nilai: String(hukdis.length) },
      { label: "Pembinaan", nilai: String(pembinaan.length) },
    ],
    lembar: [
      {
        nama: "Hukuman disiplin", judul: "Riwayat kasus & hukuman disiplin (termasuk arsip lampau)", utama: true, tautan: "tautan",
        catatan: "Jenis hukuman diambil dari salinan beku SK. Untuk arsip lampau tanpa SK tercatat, nama jenis diambil dari katalog dan ditandai \"(dari katalog)\".",
        kolom: [
          ...kolomDasar,
          { kunci: "tingkat", judul: "Tingkat" },
          { kunci: "jenis", judul: "Jenis hukuman disiplin", jenis: "panjang" },
          { kunci: "pengganti", judul: "Dijalankan sementara sebagai", jenis: "panjang" },
          { kunci: "nomor_sk", judul: "Nomor SK" },
          { kunci: "tanggal_sk", judul: "Tanggal SK", jenis: "tanggal" },
          { kunci: "tanggal_mulai_berlaku", judul: "Mulai berlaku", jenis: "tanggal" },
          { kunci: "tanggal_selesai", judul: "Selesai", jenis: "tanggal" },
        ],
        baris: hukdis,
      },
      {
        nama: "Pembinaan", judul: "Riwayat pembinaan (bukan hukuman disiplin)", tautan: "tautan",
        kolom: [...kolomDasar, { kunci: "jenis", judul: "Jenis pembinaan" }],
        baris: pembinaan,
      },
    ],
  };
}

// (d) Pegawai yang sedang menjalani hukuman ----------------------------------
async function laporanMenjalani(db: Sql, f: FilterLaporan, hari: string): Promise<IsiLaporan> {
  const rows = await db`
    select e.id, e.nomor_registrasi, ${namaPegawai(db)} as nama, ${nipPegawai(db)} as nip, ${labelUnit(db)} as unit, rz.nama as rezim,
      h.snapshot_jenis_hukuman->>'nama' as jenis, h.snapshot_jenis_hukuman->>'tingkat' as tingkat,
      h.snapshot_jenis_hukuman->'pengganti_sementara'->>'nama' as pengganti, h.snapshot_jenis_hukuman->>'regulasi' as regulasi,
      h.nomor_sk, h.tanggal_sk, h.tanggal_mulai_berlaku, h.tanggal_selesai,
      h.blokir_kgb, h.blokir_kenaikan_pangkat, h.pemotongan_ik,
      (h.tanggal_selesai - ${hari}::date)::int as sisa_hari
    from hukuman h
    join entri e on e.id = h.entri_id
    ${joinPegawaiUnit(db)}
    left join rezim rz on rz.kode = e.rezim_kode
    where e.kelas = 'hukdis' and e.diarsipkan_pada is null
      and h.tanggal_mulai_berlaku <= ${hari} and h.tanggal_selesai >= ${hari}
      ${f.rezim ? db`and e.rezim_kode = ${f.rezim}` : kosong(db)}
      ${f.unit ? db`and ${labelUnit(db)} = ${f.unit}` : kosong(db)}
      ${f.blokir === "kgb" ? db`and h.blokir_kgb` : f.blokir === "kp" ? db`and h.blokir_kenaikan_pangkat` : f.blokir === "ik" ? db`and h.pemotongan_ik` : kosong(db)}
    order by h.tanggal_selesai, 2`;
  const baris = rows.map((r): Baris => ({ ...r, tingkat: r.tingkat ? labelKode(r.tingkat) : null, tautan: `/kasus/${r.id}` }));
  return {
    ringkasan: [
      { label: "Sedang menjalani", nilai: String(baris.length) },
      { label: LABEL_BLOKIR.kgb, nilai: String(baris.filter((b) => b.blokir_kgb).length) },
      { label: LABEL_BLOKIR.kp, nilai: String(baris.filter((b) => b.blokir_kenaikan_pangkat).length) },
      { label: LABEL_BLOKIR.ik, nilai: String(baris.filter((b) => b.pemotongan_ik).length) },
    ],
    lembar: [{
      nama: "Sedang menjalani", judul: `Pegawai yang sedang menjalani hukuman per ${tanggalPendek(hari)}`, utama: true, tautan: "tautan",
      catatan: "Nama jenis hukuman diambil dari salinan beku pada SK, bukan dari katalog peraturan terkini.",
      kolom: [
        { kunci: "nama", judul: "Nama pegawai", jenis: "pii" },
        { kunci: "nip", judul: "NIP", jenis: "pii" },
        { kunci: "unit", judul: "Unit kerja" },
        { kunci: "rezim", judul: "Rezim" },
        { kunci: "regulasi", judul: "Peraturan" },
        { kunci: "tingkat", judul: "Tingkat" },
        { kunci: "jenis", judul: "Jenis hukuman disiplin", jenis: "panjang" },
        { kunci: "pengganti", judul: "Dijalankan sementara sebagai", jenis: "panjang" },
        { kunci: "nomor_sk", judul: "Nomor SK" },
        { kunci: "tanggal_sk", judul: "Tanggal SK", jenis: "tanggal" },
        { kunci: "tanggal_mulai_berlaku", judul: "Mulai berlaku", jenis: "tanggal" },
        { kunci: "tanggal_selesai", judul: "Berakhir", jenis: "tanggal" },
        { kunci: "sisa_hari", judul: "Sisa (hari kalender)", jenis: "angka" },
        { kunci: "blokir_kgb", judul: "Blokir KGB", jenis: "ya_tidak" },
        { kunci: "blokir_kenaikan_pangkat", judul: "Blokir kenaikan pangkat", jenis: "ya_tidak" },
        { kunci: "pemotongan_ik", judul: "Pemotongan IK", jenis: "ya_tidak" },
      ],
      baris,
    }],
  };
}

// (e) Rekap kepatuhan tenggat -------------------------------------------------
export type HasilTahap = "tepat" | "terlambat" | "terbuka_lewat" | "berjalan";

/** Klasifikasi satu tahap. Hanya "tepat" & "terlambat" masuk penyebut persentase. */
export function nilaiKepatuhan(t: { status: string; tenggat: string; tanggal_realisasi: string | null }, hari: string): HasilTahap {
  if (t.status === "selesai" && t.tanggal_realisasi) return t.tanggal_realisasi <= t.tenggat ? "tepat" : "terlambat";
  return t.tenggat < hari ? "terbuka_lewat" : "berjalan";
}

export function persenTepat(tepat: number, terlambat: number) {
  return tepat + terlambat ? tepat / (tepat + terlambat) : null;
}

async function laporanKepatuhan(db: Sql, f: FilterLaporan, hari: string): Promise<IsiLaporan> {
  const kal: Kalender = await muatKalender(db);
  const rows = await db`
    select t.id, e.id as entri_id, e.nomor_registrasi, e.judul, t.kode_tahap, t.nama, t.urutan, t.status, t.tenggat, t.tanggal_realisasi,
      t.tenggat_info->>'sifat' as sifat, t.tenggat_info->>'nama' as nama_tenggat
    from tahapan_kasus t
    join entri e on e.id = t.entri_id
    where ${dihitung(db)}
      and t.tenggat is not null
      and t.status <> 'dilewati'
      and not (t.opsional and t.status = 'belum')
      ${f.dari ? db`and t.tenggat >= ${f.dari}` : kosong(db)}
      ${f.sampai ? db`and t.tenggat <= ${f.sampai}` : kosong(db)}
      ${f.rezim ? db`and e.rezim_kode = ${f.rezim}` : kosong(db)}
    order by t.tenggat, e.nomor_registrasi`;
  type Agregat = { label: string; urut: number | string; tepat: number; terlambat: number; terbuka_lewat: number; berjalan: number };
  const perBulan = new Map<string, Agregat>();
  const perTahap = new Map<string, Agregat>();
  const total: Agregat = { label: "Jumlah", urut: "", tepat: 0, terlambat: 0, terbuka_lewat: 0, berjalan: 0 };
  const LABEL_HASIL: Record<HasilTahap, string> = { tepat: "Tepat waktu", terlambat: "Terlambat", terbuka_lewat: "Belum selesai, lewat tenggat", berjalan: "Belum jatuh tempo" };
  const rincian: Baris[] = [];
  for (const r of rows) {
    const h = nilaiKepatuhan(r as never, hari);
    const bln = String(r.tenggat).slice(0, 7);
    const ab = perBulan.get(bln) ?? { label: `${namaBulan(Number(bln.slice(5, 7)))} ${bln.slice(0, 4)}`, urut: bln, tepat: 0, terlambat: 0, terbuka_lewat: 0, berjalan: 0 };
    const at = perTahap.get(r.nama) ?? { label: r.nama, urut: r.urutan, tepat: 0, terlambat: 0, terbuka_lewat: 0, berjalan: 0 };
    at.urut = Math.min(Number(at.urut), r.urutan);
    for (const a of [ab, at, total]) a[h] += 1;
    perBulan.set(bln, ab);
    perTahap.set(r.nama, at);
    rincian.push({
      ...r, hasil: LABEL_HASIL[h],
      selisih: r.tanggal_realisasi ? selisihHariKerja(r.tenggat, r.tanggal_realisasi, kal) : null,
      sifat: r.sifat === "pengingat_internal" ? "Pengingat internal" : "Wajib hukum",
      tautan: `/kasus/${r.entri_id}`,
    });
  }
  const keBaris = (a: Agregat): Baris => ({ ...a, dinilai: a.tepat + a.terlambat, persen: persenTepat(a.tepat, a.terlambat) });
  const kolomAgregat = (judul: string): Kolom[] => [
    { kunci: "label", judul },
    { kunci: "dinilai", judul: "Tahap selesai (dinilai)", jenis: "angka" },
    { kunci: "tepat", judul: "Tepat waktu", jenis: "angka" },
    { kunci: "terlambat", judul: "Terlambat", jenis: "angka" },
    { kunci: "persen", judul: "% tepat waktu", jenis: "persen" },
    { kunci: "terbuka_lewat", judul: "Belum selesai & lewat tenggat", jenis: "angka" },
  ];
  const bulanBaris = [...perBulan.values()].sort((a, b) => String(a.urut).localeCompare(String(b.urut))).map(keBaris);
  const tahapBaris = [...perTahap.values()].sort((a, b) => Number(a.urut) - Number(b.urut)).map(keBaris);
  if (bulanBaris.length) bulanBaris.push(keBaris(total));
  if (tahapBaris.length) tahapBaris.push(keBaris(total));
  const p = persenTepat(total.tepat, total.terlambat);
  const catatan = "Persentase = tahap selesai dengan tanggal realisasi tidak melewati tenggat ÷ seluruh tahap selesai yang bertenggat. Tahap yang belum selesai tidak masuk penyebut; yang sudah lewat tenggat ditampilkan tersendiri.";
  return {
    ringkasan: [
      { label: "Persentase tepat waktu", nilai: p === null ? "—" : `${(p * 100).toLocaleString("id-ID", { maximumFractionDigits: 1 })}%`, warna: p === null ? undefined : p >= 0.9 ? "aman" as const : p >= 0.7 ? "waspada" as const : "lewat" as const },
      { label: "Tahap dinilai", nilai: String(total.tepat + total.terlambat) },
      { label: "Terlambat", nilai: String(total.terlambat), warna: total.terlambat ? "waspada" as const : undefined },
      { label: "Belum selesai & lewat tenggat", nilai: String(total.terbuka_lewat), warna: total.terbuka_lewat ? "lewat" as const : undefined },
    ],
    lembar: [
      { nama: "Per bulan", judul: "Kepatuhan tenggat per bulan (bulan tenggat)", kolom: kolomAgregat("Bulan"), baris: bulanBaris, catatan },
      { nama: "Per tahap", judul: "Kepatuhan tenggat per tahap", kolom: kolomAgregat("Tahap"), baris: tahapBaris },
      {
        nama: "Rincian", judul: "Rincian tahap bertenggat", utama: true, tautan: "tautan",
        kolom: [
          { kunci: "nomor_registrasi", judul: "Nomor registrasi" },
          { kunci: "judul", judul: "Judul kasus", jenis: "panjang" },
          { kunci: "nama", judul: "Tahap" },
          { kunci: "sifat", judul: "Sifat tenggat" },
          { kunci: "tenggat", judul: "Tenggat", jenis: "tanggal" },
          { kunci: "tanggal_realisasi", judul: "Realisasi", jenis: "tanggal" },
          { kunci: "selisih", judul: "Selisih (hari kerja, + = terlambat)", jenis: "angka" },
          { kunci: "hasil", judul: "Hasil" },
        ],
        baris: rincian,
      },
    ],
  };
}

// ---------------------------------------------------------------------------
// ALAT / KALKULATOR (dipakai halaman /alat lewat aksi server)
// ---------------------------------------------------------------------------

export type RegulasiPilihan = { id: string; nama_singkat: string; rezim_kode: string | null; berlaku_dari: string | null; berlaku_sampai: string | null; status: string };

/** Peraturan utama (dasar kasus) untuk pilihan manual kalkulator. */
export async function daftarRegulasiUtama(db: Sql = sql): Promise<RegulasiPilihan[]> {
  return (await db`select id, nama_singkat, rezim_kode, berlaku_dari, berlaku_sampai, status from regulasi
    where utama and status <> 'draf' order by rezim_kode nulls last, berlaku_dari desc nulls last`) as unknown as RegulasiPilihan[];
}

export type PemilihanRegulasi =
  | { ok: true; id: string; nama: string; otomatis: boolean; alasan: string }
  | { ok: false; pesan: string };

async function pilihRegulasiKalkulator(db: Sql, m: { regulasiId?: string | null; rezim?: string | null; tanggal: string }): Promise<PemilihanRegulasi> {
  if (m.regulasiId) {
    if (!POLA_UUID.test(m.regulasiId)) return { ok: false, pesan: "Peraturan tidak ditemukan." };
    const [r] = await db`select id, nama_singkat from regulasi where id = ${m.regulasiId}`;
    if (!r) return { ok: false, pesan: "Peraturan tidak ditemukan." };
    return { ok: true, id: r.id, nama: r.nama_singkat, otomatis: false, alasan: `Dipilih manual: ${r.nama_singkat}.` };
  }
  if (!m.rezim) return { ok: false, pesan: "Pilih rezim pegawai atau peraturan secara manual." };
  const [rz] = await db`select nama from rezim where kode = ${m.rezim}`;
  const res = await resolveRegulasi(m.rezim, m.tanggal, db);
  if (res.status !== "tunggal") return { ok: false, pesan: res.pesan };
  const r = res.regulasi;
  const masa = `${r.berlaku_dari ? tanggalPanjang(r.berlaku_dari) : "awal"} – ${r.berlaku_sampai ? tanggalPanjang(r.berlaku_sampai) : "sekarang"}`;
  return {
    ok: true, id: r.id, nama: r.nama_singkat, otomatis: true,
    alasan: `Dipilih otomatis: rezim ${rz?.nama ?? m.rezim}, dan tanggal ${tanggalPanjang(m.tanggal)} berada dalam masa berlaku ${r.nama_singkat} (${masa}).`,
  };
}

export type HariDilewati = { tanggal: string; alasan: string };

/** Hari yang dilewati (akhir pekan/libur) di antara dua tanggal, tidak termasuk tanggal awal. */
export async function hariDilewati(db: Sql, dari: string, sampai: string, kal: Kalender): Promise<HariDilewati[]> {
  const [a, b] = dari <= sampai ? [dari, sampai] : [sampai, dari];
  const libur = await db`select tanggal, nama from hari_libur where tanggal > ${a} and tanggal <= ${b}`;
  const nama = new Map(libur.map((l) => [l.tanggal as string, l.nama as string]));
  const hasil: HariDilewati[] = [];
  let cur = a;
  while (cur < b) {
    cur = geserHari(cur, 1);
    const h = new Date(`${cur}T00:00:00Z`).getUTCDay();
    if (h === 0 || h === 6) hasil.push({ tanggal: cur, alasan: h === 0 ? "Minggu" : "Sabtu" });
    else if (kal.libur.has(cur)) hasil.push({ tanggal: cur, alasan: nama.get(cur) ?? "Hari libur" });
  }
  return hasil;
}

export type HasilKalkulatorBerlaku =
  | { ok: false; pesan: string }
  | {
      ok: true;
      regulasi: Extract<PemilihanRegulasi, { ok: true }>;
      aturan: { nama: string; jumlah: number; satuan: string; hitungHariDasar: boolean; pasal: string | null; dihitungDari: string; sifat: string };
      tanggalDiterima: string;
      tanggalBerlaku: string;
      dilewati: HariDilewati[];
    };

/** "Kapan SK mulai berlaku?" — memakai aturan_tenggat ber-kode_tahap 'berlaku' milik peraturan terpilih. */
export async function kalkulatorBerlaku(m: { regulasiId?: string | null; rezim?: string | null; tanggalDiterima: string }, db: Sql = sql): Promise<HasilKalkulatorBerlaku> {
  if (!POLA_TANGGAL.test(m.tanggalDiterima)) return { ok: false, pesan: "Isi tanggal SK diterima pegawai." };
  const reg = await pilihRegulasiKalkulator(db, { ...m, tanggal: m.tanggalDiterima });
  if (!reg.ok) return { ok: false, pesan: reg.pesan };
  const [aturan, kal] = await Promise.all([muatAturan(reg.id, db), muatKalender(db)]);
  const t = aturan.tenggat.find((x) => x.kode_tahap === "berlaku");
  if (!t) return { ok: false, pesan: `${reg.nama} belum memiliki aturan tenggat "mulai berlaku". Lengkapi katalog aturan peraturan ini di Pengaturan.` };
  const tanggalBerlaku = hitungTanggalTenggat(t, m.tanggalDiterima, kal);
  return {
    ok: true, regulasi: reg,
    aturan: { nama: t.nama_tenggat, jumlah: t.jumlah, satuan: t.satuan, hitungHariDasar: t.hitung_hari_dasar, pasal: t.pasal_rujukan, dihitungDari: t.dihitung_dari, sifat: t.sifat },
    tanggalDiterima: m.tanggalDiterima, tanggalBerlaku,
    dilewati: t.satuan === "hari_kerja" ? await hariDilewati(db, m.tanggalDiterima, tanggalBerlaku, kal) : [],
  };
}

export type BarisAmbang = { id: string | null; rentang: string; berturut: boolean; tingkat: string | null; jenis: string | null; cocok: boolean };

export type HasilKalkulatorAmbang =
  | { ok: false; pesan: string }
  | {
      ok: true;
      regulasi: Extract<PemilihanRegulasi, { ok: true }>;
      hari: number;
      berturut: boolean;
      usulan: null | {
        tingkat: string | null; jenis: string | null; pengganti: string | null; peringatanJenis: string | null;
        pasal: string | null; akibat: string | null; alurKhusus: string | null;
      };
      berikut: null | { hariMin: number; selisih: number; tingkat: string | null; jenis: string | null };
      tabel: BarisAmbang[];
    };

/** Kalkulator ambang kehadiran: peraturan dipilih resolver dari rezim + tanggal peristiwa. */
export async function kalkulatorAmbang(m: { rezim?: string | null; regulasiId?: string | null; tanggalPeristiwa: string; hari: number; berturut: boolean }, db: Sql = sql): Promise<HasilKalkulatorAmbang> {
  if (!POLA_TANGGAL.test(m.tanggalPeristiwa)) return { ok: false, pesan: "Isi tanggal peristiwa — dipakai untuk menentukan peraturan yang berlaku." };
  const hari = Math.floor(Number(m.hari));
  if (!Number.isFinite(hari) || hari < 0 || hari > 366) return { ok: false, pesan: "Jumlah hari tidak masuk kerja harus antara 0 dan 366." };
  const reg = await pilihRegulasiKalkulator(db, { ...m, tanggal: m.tanggalPeristiwa });
  if (!reg.ok) return { ok: false, pesan: reg.pesan };
  const a = await muatAturan(reg.id, db);
  if (!a.ambang.length) return { ok: false, pesan: `${reg.nama} belum memiliki tabel ambang kehadiran di katalog aturan.` };
  const h = hitungAmbangKehadiran(a, hari, m.berturut ? hari : null);
  const b = ambangBerikutnya(a, hari);
  const namaTingkat = (kode: string | null) => (kode ? a.tingkat.find((t) => t.kode === kode)?.nama ?? kode : null);
  const namaJenis = (kode: string | null) => (kode ? a.jenis.find((j) => j.kode === kode)?.nama ?? kode : null);
  return {
    ok: true, regulasi: reg, hari, berturut: m.berturut,
    usulan: h ? {
      tingkat: h.tingkat?.nama ?? null, jenis: h.jenis?.nama ?? null, pengganti: h.diganti ? h.jenisEfektif?.nama ?? null : null,
      peringatanJenis: h.jenis?.peringatan ?? null, pasal: h.ambang.pasal_rujukan, akibat: h.ambang.akibat_tambahan, alurKhusus: h.ambang.alur_khusus,
    } : null,
    berikut: b ? { hariMin: b.ambang.hari_min, selisih: b.ambang.hari_min - hari, tingkat: b.tingkat?.nama ?? null, jenis: b.jenisEfektif?.nama ?? b.jenis?.nama ?? null } : null,
    tabel: a.ambang.map((x) => ({
      id: x.id ?? null,
      rentang: x.hari_max === null ? `≥ ${x.hari_min}` : x.hari_min === x.hari_max ? String(x.hari_min) : `${x.hari_min}–${x.hari_max}`,
      berturut: x.berturut_turut,
      tingkat: namaTingkat(x.tingkat_kode),
      jenis: namaJenis(x.jenis_kode),
      cocok: !!h && h.ambang === x,
    })),
  };
}
