// Logika impor pegawai (validasi + upsert) — dipakai bersama oleh aksi server wizard impor
// dan skrip `scripts/impor-dummy.ts`. Tidak memakai "server-only" agar bisa dijalankan dari skrip,
// tetapi hanya boleh dipanggil dari server.
//
// Aturan (PRD §8):
// - Hanya kolom dalam daftar putih (normalisasi.ts) yang disimpan; kolom terlarang ditolak keras.
// - Pencocokan: NIP; baris tanpa NIP → nama persis + tanggal lahir; selain itu → baris baru.
// - Field yang tercantum di pegawai.field_manual tidak pernah ditimpa ("dilewati karena disunting manual").
// - rezim_kode dari pemetaan_status_pegawai, kecuali rezim_manual.
// - unit_kerja dibuat dari nilai unik Direktorat/Fakultas (induk) dan Unit Kerja (anak).

import { sql as sqlBawaan, transaksi, type Sql } from "@/lib/db";
import { GalatPengguna } from "@/lib/galat";
import { POLA_UNIT_DELEGASI } from "@/supabase/seed/referensi";
import {
  KOLOM_IMPOR, KODE_FIELD, adalahField, kolomTerlarang, kunciNamaLahir, validasiKumpulan,
  type BarisDitolak, type BarisMasuk, type DataPegawai, type KolomImpor,
} from "./normalisasi";
import type { KodeSumber } from "./jenis";

export const BATAS_BATCH = 200;

export type KolomMasuk = { indeks: number; header: string; field: string };

export type BarisDilewati = { baris: number; nip: string | null; nama: string | null; field: string[] };

export type HasilBatch = {
  jumlah: number;
  baru: number;
  diperbarui: number;
  /** Bagian dari `diperbarui` yang isinya sama persis dengan data sebelumnya. */
  tanpaPerubahan: number;
  ditolak: BarisDitolak[];
  dilewatiManual: BarisDilewati[];
  statusTakDikenal: Record<string, number>;
  unitBaru: string[];
};

export type OpsiImpor = {
  sumber: KodeSumber;
  penggunaId?: string | null;
  /** true = hanya menghitung (tidak menulis apa pun). */
  simulasi?: boolean;
  /** Hanya bila pengguna sudah mengonfirmasi secara eksplisit. Bawaan: field manual tidak ditimpa. */
  izinkanTimpaManual?: boolean;
};

// ---------------------------------------------------------------------------
// Pemeriksaan masukan dari peramban (jangan pernah percaya klien)
// ---------------------------------------------------------------------------
/** Menolak keras kolom terlarang / field di luar daftar putih. Mengembalikan daftar field yang sah. */
export function periksaKolom(kolom: KolomMasuk[]): Set<string> {
  if (!Array.isArray(kolom) || kolom.length === 0) throw new GalatPengguna("Belum ada kolom yang dipetakan.");
  if (kolom.length > KODE_FIELD.size) throw new GalatPengguna("Pemetaan kolom tidak valid.");
  const field = new Set<string>();
  for (const k of kolom) {
    if (kolomTerlarang(k?.header)) throw new GalatPengguna(`Kolom "${k.header}" ditolak: kolom ini sengaja tidak disimpan SIMPEL.`);
    if (!adalahField(k?.field)) throw new GalatPengguna("Ada kolom yang dipetakan ke isian yang tidak diizinkan. Impor dibatalkan.");
    if (field.has(k.field)) throw new GalatPengguna("Satu isian tujuan hanya boleh dipetakan dari satu kolom.");
    field.add(k.field);
  }
  return field;
}

/** Memeriksa bentuk baris: hanya field yang dipetakan, nilai berupa teks pendek, jumlah ≤ batas. */
export function periksaBaris(baris: unknown, fieldSah: Set<string>): BarisMasuk[] {
  if (!Array.isArray(baris)) throw new GalatPengguna("Data impor tidak valid.");
  if (baris.length > BATAS_BATCH) throw new GalatPengguna(`Maksimal ${BATAS_BATCH} baris per kiriman.`);
  return baris.map((b) => {
    if (!b || typeof b !== "object") throw new GalatPengguna("Data impor tidak valid.");
    const o: BarisMasuk = { nomor: 0 };
    for (const [k, v] of Object.entries(b as Record<string, unknown>)) {
      if (k === "nomor") {
        o.nomor = Number(v) || 0;
        continue;
      }
      if (!fieldSah.has(k) || !adalahField(k)) throw new GalatPengguna("Ada isian yang tidak diizinkan dalam data impor. Impor dibatalkan.");
      if (v !== null && v !== undefined && typeof v !== "string" && typeof v !== "number") throw new GalatPengguna("Data impor tidak valid.");
      o[k] = v === undefined ? null : (v as string | number | null);
    }
    return o;
  });
}

// ---------------------------------------------------------------------------
// Unit kerja
// ---------------------------------------------------------------------------
const JENIS_UNIT: [RegExp, string][] = [
  [/^sub\s*direktorat/i, "subdirektorat"],
  [/^direktorat/i, "direktorat"],
  [/^fakultas/i, "fakultas"],
  [/^sekolah/i, "sekolah"],
  [/^lembaga/i, "lembaga"],
  [/^badan/i, "badan"],
  [/^upt/i, "upt"],
  [/^sekretariat/i, "sekretariat"],
  [/^tata usaha/i, "tata_usaha"],
  [/^(departemen|jurusan)/i, "departemen"],
  [/^program studi/i, "program_studi"],
  [/^lab/i, "laboratorium"],
  [/^(seksi|sub\s*bag|bagian)/i, "seksi"],
];

export function tebakJenisUnit(nama: string, tingkatAtas: boolean) {
  for (const [p, j] of JENIS_UNIT) if (p.test(nama)) return j;
  return tingkatAtas ? "unit_utama" : "unit";
}

/** Heuristik awal delegasi hukuman ringan (Pertor 70/2026 Pasal 14 ayat 3) — admin menyunting kemudian. */
export function tebakDelegasi(nama: string) {
  const n = nama.trim().toLowerCase();
  return POLA_UNIT_DELEGASI.some((p) => n.startsWith(p.toLowerCase()));
}

type UnitRingkas = { id: string; nama: string; induk_id: string | null };

/**
 * Memastikan unit kerja untuk pasangan (direktorat/fakultas, unit kerja) ada.
 * Mengembalikan peta lower(nama) → id dan daftar nama unit yang baru dibuat (atau akan dibuat saat simulasi).
 */
async function siapkanUnit(db: Sql, pasangan: { atas: string | null; unit: string | null }[], simulasi: boolean, penggunaId: string | null) {
  const nama = new Map<string, string>(); // lower → tampilan
  for (const p of pasangan) {
    if (p.atas) nama.set(p.atas.toLowerCase(), p.atas);
    if (p.unit) nama.set(p.unit.toLowerCase(), p.unit);
  }
  const peta = new Map<string, string>();
  if (!nama.size) return { peta, baru: [] as string[] };
  const ada = (await db`select id, nama, induk_id from unit_kerja where lower(nama) in ${db([...nama.keys()])}`) as unknown as UnitRingkas[];
  for (const u of ada) peta.set(u.nama.toLowerCase(), u.id);

  const atasBaru = new Map<string, string>();
  for (const p of pasangan) if (p.atas && !peta.has(p.atas.toLowerCase())) atasBaru.set(p.atas.toLowerCase(), p.atas);
  const anakBaru = new Map<string, { nama: string; atas: string | null }>();
  for (const p of pasangan) {
    if (!p.unit) continue;
    const k = p.unit.toLowerCase();
    if (peta.has(k) || atasBaru.has(k) || anakBaru.has(k)) continue;
    anakBaru.set(k, { nama: p.unit, atas: p.atas?.toLowerCase() ?? null });
  }
  const baru = [...atasBaru.values(), ...[...anakBaru.values()].map((a) => a.nama)];
  if (simulasi) return { peta, baru };

  if (atasBaru.size) {
    const rows = [...atasBaru.values()].map((n) => ({
      nama: n, induk_id: null, jenis: tebakJenisUnit(n, true), punya_delegasi_hukdis_ringan: tebakDelegasi(n),
      created_by: penggunaId, updated_by: penggunaId,
    }));
    const r = await db`insert into unit_kerja ${db(rows)} on conflict ((lower(nama))) do nothing returning id, nama`;
    for (const u of r) peta.set(String(u.nama).toLowerCase(), u.id as string);
  }
  if (anakBaru.size) {
    const rows = [...anakBaru.values()].map((a) => ({
      nama: a.nama, induk_id: a.atas ? peta.get(a.atas) ?? null : null, jenis: tebakJenisUnit(a.nama, false),
      punya_delegasi_hukdis_ringan: false, created_by: penggunaId, updated_by: penggunaId,
    }));
    const r = await db`insert into unit_kerja ${db(rows)} on conflict ((lower(nama))) do nothing returning id, nama`;
    for (const u of r) peta.set(String(u.nama).toLowerCase(), u.id as string);
  }
  // Baris yang bentrok karena dibuat bersamaan oleh proses lain
  const kurang = [...nama.keys()].filter((k) => !peta.has(k));
  if (kurang.length) {
    const r = await db`select id, nama from unit_kerja where lower(nama) in ${db(kurang)}`;
    for (const u of r) peta.set(String(u.nama).toLowerCase(), u.id as string);
  }
  return { peta, baru };
}

// ---------------------------------------------------------------------------
// Proses satu batch
// ---------------------------------------------------------------------------
const KOLOM_TANGGAL = new Set<string>(["tanggal_lahir", "tmt_golongan", "tmt_jabatan_fungsional", "tanggal_masuk", "tanggal_keluar"]);

type PegawaiAda = Record<KolomImpor, string | null> & {
  id: string; unit_kerja_id: string | null; rezim_kode: string | null; rezim_manual: boolean; field_manual: string[];
};

const daftarKolomPilih = (db: Sql) => db(["id", ...KOLOM_IMPOR, "unit_kerja_id", "rezim_kode", "rezim_manual", "field_manual"]);

/**
 * Memproses ≤ BATAS_BATCH baris: normalisasi, validasi, pencocokan, lalu (bila bukan simulasi)
 * insert & update massal dalam satu transaksi.
 */
export async function prosesBatch(baris: BarisMasuk[], opsi: OpsiImpor, db: Sql = sqlBawaan): Promise<HasilBatch> {
  if (baris.length > BATAS_BATCH) throw new GalatPengguna(`Maksimal ${BATAS_BATCH} baris per kiriman.`);
  const pemetaanStatus = new Map<string, string | null>(
    (await db`select status_pegawai, rezim_kode from pemetaan_status_pegawai`).map((r) => [String(r.status_pegawai).toLowerCase(), r.rezim_kode as string | null]),
  );
  const v = validasiKumpulan(baris, pemetaanStatus.keys());
  const ditolak: BarisDitolak[] = [...v.ditolak];
  const dilewatiManual: BarisDilewati[] = [];

  // --- pencocokan dengan data yang sudah ada
  const nips = [...new Set(v.sah.map((s) => s.data.nip).filter((x): x is string => !!x))];
  const byNip = new Map<string, PegawaiAda>();
  if (nips.length) {
    const r = (await db`select ${daftarKolomPilih(db)} from pegawai where nip in ${db(nips)}`) as unknown as PegawaiAda[];
    for (const p of r) byNip.set(p.nip!, p);
  }
  const perluNama = v.sah.filter((s) => !s.data.nip || !byNip.has(s.data.nip));
  const namaLower = [...new Set(perluNama.map((s) => s.data.nama_lengkap_gelar?.replace(/\s+/g, " ").trim().toLowerCase()).filter((x): x is string => !!x))];
  const byNama = new Map<string, PegawaiAda[]>();
  if (namaLower.length) {
    const r = (await db`select ${daftarKolomPilih(db)} from pegawai
      where lower(regexp_replace(trim(nama_lengkap_gelar), '\\s+', ' ', 'g')) in ${db(namaLower)}`) as unknown as PegawaiAda[];
    for (const p of r) {
      const k = kunciNamaLahir(p.nama_lengkap_gelar, p.tanggal_lahir);
      if (k) byNama.set(k, [...(byNama.get(k) ?? []), p]);
    }
  }

  // --- unit kerja
  const pakaiUnit = v.sah.some((s) => "unit_kerja" in s.data || "direktorat_fakultas" in s.data);
  const pasangan = pakaiUnit ? v.sah.map((s) => ({ atas: s.data.direktorat_fakultas ?? null, unit: s.data.unit_kerja ?? null })) : [];

  const kerjakan = async (tx: Sql): Promise<HasilBatch> => {
    const { peta, baru: unitBaru } = await siapkanUnit(tx, pasangan, !!opsi.simulasi, opsi.penggunaId ?? null);
    const unitDari = (d: DataPegawai) => {
      const k = (d.unit_kerja ?? d.direktorat_fakultas)?.toLowerCase();
      return k ? peta.get(k) ?? null : null;
    };
    const rezimDari = (status: string | null | undefined) => (status ? pemetaanStatus.get(status.toLowerCase()) ?? null : null);

    const sisipan: Record<string, unknown>[] = [];
    const ubahan: Record<string, unknown>[] = [];
    let tanpaPerubahan = 0;
    const sasaranTerpakai = new Set<string>();

    for (const s of v.sah) {
      const d = s.data;
      let ada: PegawaiAda | null = d.nip ? byNip.get(d.nip) ?? null : null;
      if (!ada) {
        const kandidat = (byNama.get(kunciNamaLahir(d.nama_lengkap_gelar, d.tanggal_lahir) ?? "") ?? []).filter((p) => !d.nip || !p.nip);
        if (kandidat.length > 1) {
          ditolak.push({ baris: s.nomor, alasan: "Ada lebih dari satu pegawai dengan nama & tanggal lahir yang sama di SIMPEL; lengkapi NIP-nya", nip: d.nip ?? null, nama: d.nama_lengkap_gelar ?? null });
          continue;
        }
        ada = kandidat[0] ?? null;
      }
      if (ada && sasaranTerpakai.has(ada.id)) {
        ditolak.push({ baris: s.nomor, alasan: "Baris lain di berkas sudah memperbarui pegawai yang sama", nip: d.nip ?? null, nama: d.nama_lengkap_gelar ?? null });
        continue;
      }

      if (!ada) {
        if (!d.nama_lengkap_gelar) {
          ditolak.push({ baris: s.nomor, alasan: "Pegawai baru wajib memiliki nama lengkap", nip: d.nip ?? null, nama: null });
          continue;
        }
        const row: Record<string, unknown> = {};
        for (const k of KOLOM_IMPOR) row[k] = d[k] ?? null;
        row.unit_kerja_id = unitDari(d);
        row.rezim_kode = rezimDari(d.status_pegawai);
        sisipan.push(row);
        continue;
      }

      sasaranTerpakai.add(ada.id);
      const manual = new Set(opsi.izinkanTimpaManual ? [] : ada.field_manual ?? []);
      const akhir: Record<string, unknown> = { id: ada.id };
      const lewati: string[] = [];
      let berubah = false;
      for (const k of KOLOM_IMPOR) {
        const lama = ada[k] ?? null;
        if (!(k in d)) { akhir[k] = lama; continue; } // field tidak ada di sumber → tetap
        const nilai = d[k] ?? null;
        // field turunan ikut status manual field induknya
        const kunciManual = k === "pangkat" || k === "golongan_ruang" ? "golongan_pangkat" : k;
        if (manual.has(kunciManual) || manual.has(k)) {
          if (nilai !== lama && k === kunciManual) lewati.push(k);
          akhir[k] = lama;
          continue;
        }
        if (nilai !== lama) berubah = true;
        akhir[k] = nilai;
      }
      const sentuhUnit = "unit_kerja" in d || "direktorat_fakultas" in d;
      akhir.unit_kerja_id = sentuhUnit && !manual.has("unit_kerja") && !manual.has("unit_kerja_id") ? unitDari(d) : ada.unit_kerja_id;
      if (akhir.unit_kerja_id !== ada.unit_kerja_id) berubah = true;
      akhir.rezim_kode = ada.rezim_manual ? ada.rezim_kode : rezimDari((akhir.status_pegawai as string | null) ?? null);
      if (akhir.rezim_kode !== ada.rezim_kode) berubah = true;
      if (lewati.length) dilewatiManual.push({ baris: s.nomor, nip: ada.nip, nama: ada.nama_lengkap_gelar, field: lewati });
      if (!berubah) tanpaPerubahan++;
      ubahan.push(akhir);
    }

    if (!opsi.simulasi) {
      const pengguna = opsi.penggunaId ?? null;
      if (sisipan.length) {
        const rows = sisipan.map((r) => ({ ...r, sumber: opsi.sumber, sumber_sinkron_terakhir: new Date(), created_by: pengguna, updated_by: pengguna }));
        await tx`insert into pegawai ${tx(rows)}`;
      }
      if (ubahan.length) {
        const definisi = [
          "id uuid", ...KOLOM_IMPOR.map((k) => `${k} ${KOLOM_TANGGAL.has(k) ? "date" : "text"}`), "unit_kerja_id uuid", "rezim_kode text",
        ].join(", ");
        const set = [...KOLOM_IMPOR, "unit_kerja_id", "rezim_kode"].map((k) => `${k} = x.${k}`).join(", ");
        await tx`update pegawai p set ${tx.unsafe(set)}, sumber = ${opsi.sumber}, sumber_sinkron_terakhir = now(), updated_by = ${pengguna}
          from jsonb_to_recordset(${tx.json(ubahan as never)}) as x(${tx.unsafe(definisi)})
          where p.id = x.id`;
      }
    }

    ditolak.sort((a, b) => a.baris - b.baris);
    return {
      jumlah: baris.length, baru: sisipan.length, diperbarui: ubahan.length, tanpaPerubahan, ditolak, dilewatiManual,
      statusTakDikenal: v.statusTakDikenal, unitBaru,
    };
  };

  return opsi.simulasi ? kerjakan(db) : db === sqlBawaan ? transaksi(kerjakan) : kerjakan(db);
}

// ---------------------------------------------------------------------------
// Riwayat impor (tanpa nilai kolom terlarang — hanya field daftar putih yang pernah sampai ke sini)
// ---------------------------------------------------------------------------
const BATAS_RINCIAN = 1000;

export type RincianRiwayat = {
  ditolak: BarisDitolak[];
  dilewati_manual: BarisDilewati[];
  status_tak_dikenal: Record<string, number>;
  unit_baru: string[];
  tanpa_perubahan: number;
  sumber: KodeSumber;
  selesai: boolean;
};

export async function mulaiRiwayat(
  m: { namaFile: string | null; profilId?: string | null; jumlahBaris: number; kolom: KolomMasuk[]; sumber: KodeSumber; penggunaId?: string | null },
  db: Sql = sqlBawaan,
) {
  periksaKolom(m.kolom);
  const rincian: RincianRiwayat = { ditolak: [], dilewati_manual: [], status_tak_dikenal: {}, unit_baru: [], tanpa_perubahan: 0, sumber: m.sumber, selesai: false };
  const pemetaan = m.kolom.map((k) => ({ indeks: k.indeks, header: String(k.header ?? "").slice(0, 120), field: k.field }));
  const [r] = await db`insert into riwayat_impor (nama_file, profil_id, jumlah_baris, rincian_tolak, pemetaan, created_by)
    values (${m.namaFile?.slice(0, 200) ?? null}, ${m.profilId ?? null}, ${m.jumlahBaris}, ${db.json(rincian as never)}, ${db.json(pemetaan as never)}, ${m.penggunaId ?? null})
    returning id`;
  return r.id as string;
}

export async function tambahHasilRiwayat(id: string, h: HasilBatch, db: Sql = sqlBawaan) {
  const kerja = async (tx: Sql) => {
    const [r] = await tx`select rincian_tolak from riwayat_impor where id = ${id} for update`;
    if (!r) throw new GalatPengguna("Riwayat impor tidak ditemukan.");
    const lama = (r.rincian_tolak ?? {}) as RincianRiwayat;
    if (lama.selesai) throw new GalatPengguna("Impor ini sudah selesai. Mulai impor baru.");
    const st = { ...(lama.status_tak_dikenal ?? {}) };
    for (const [k, n] of Object.entries(h.statusTakDikenal)) st[k] = (st[k] ?? 0) + n;
    const rincian: RincianRiwayat = {
      ...lama,
      ditolak: [...(lama.ditolak ?? []), ...h.ditolak].slice(0, BATAS_RINCIAN),
      dilewati_manual: [...(lama.dilewati_manual ?? []), ...h.dilewatiManual].slice(0, BATAS_RINCIAN),
      status_tak_dikenal: st,
      unit_baru: [...new Set([...(lama.unit_baru ?? []), ...h.unitBaru])].slice(0, BATAS_RINCIAN),
      tanpa_perubahan: (lama.tanpa_perubahan ?? 0) + h.tanpaPerubahan,
    };
    await tx`update riwayat_impor set jumlah_baru = jumlah_baru + ${h.baru}, jumlah_diperbarui = jumlah_diperbarui + ${h.diperbarui},
      jumlah_ditolak = jumlah_ditolak + ${h.ditolak.length}, rincian_tolak = ${tx.json(rincian as never)} where id = ${id}`;
  };
  return db === sqlBawaan ? transaksi(kerja) : kerja(db);
}

export async function selesaikanRiwayat(id: string, db: Sql = sqlBawaan) {
  const [r] = await db`update riwayat_impor set rincian_tolak = jsonb_set(coalesce(rincian_tolak, '{}'::jsonb), '{selesai}', 'true'::jsonb)
    where id = ${id} returning id, nama_file, jumlah_baris, jumlah_baru, jumlah_diperbarui, jumlah_ditolak, rincian_tolak`;
  if (!r) throw new GalatPengguna("Riwayat impor tidak ditemukan.");
  return r as unknown as {
    id: string; nama_file: string | null; jumlah_baris: number; jumlah_baru: number; jumlah_diperbarui: number; jumlah_ditolak: number; rincian_tolak: RincianRiwayat;
  };
}

/** Ringkasan untuk audit_log (tanpa data pribadi). */
export function ringkasanAudit(r: Awaited<ReturnType<typeof selesaikanRiwayat>>) {
  return {
    riwayat_impor_id: r.id, nama_file: r.nama_file, sumber: r.rincian_tolak?.sumber ?? null, jumlah_baris: r.jumlah_baris, baru: r.jumlah_baru,
    diperbarui: r.jumlah_diperbarui, ditolak: r.jumlah_ditolak, dilewati_manual: r.rincian_tolak?.dilewati_manual?.length ?? 0,
    unit_baru: r.rincian_tolak?.unit_baru?.length ?? 0,
  };
}

/** Menghitung ulang rezim_kode semua pegawai yang tidak di-set manual, dari tabel pemetaan. */
export async function terapkanUlangRezim(db: Sql = sqlBawaan, penggunaId: string | null = null) {
  const r = await db`update pegawai p set rezim_kode = m.rezim_kode, updated_by = ${penggunaId}
    from (select pg.id, ps.rezim_kode from pegawai pg left join pemetaan_status_pegawai ps on lower(ps.status_pegawai) = lower(pg.status_pegawai)
          where not pg.rezim_manual) m
    where p.id = m.id and p.rezim_kode is distinct from m.rezim_kode
    returning p.id`;
  return r.length;
}
