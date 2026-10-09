import "server-only";
import { randomUUID } from "node:crypto";
import { sql, transaksi, type Sql } from "@/lib/db";
import { catatAudit } from "@/lib/audit";
import { GalatPengguna } from "@/lib/galat";
import { tanggalAngka, tanggalPanjang } from "@/lib/format";
import { hapusBerkas, unduhBerkas, unggahBerkas } from "@/lib/penyimpanan";
import { isiTemplate, labelDariKode, type Pemetaan, type PlaceholderTemplate } from "@/lib/dokumen/template";
import { konteksDokumen } from "@/lib/dokumen/konteks";

// Pembangkit dokumen (PRD §7.3): template versi aktif + pemetaan placeholder →
// nilai dari konteks kasus + isian manual → .docx di bucket privat + baris
// `dokumen` dengan salinan beku seluruh nilai (snapshot_data) dan template_versi_id.

export const MIME_DOCX = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

export type IsianKosong = { kode: string; label: string; jenis: "teks" | "loop"; field?: string[] };

/** Placeholder yang wajar kosong (tidak ditanyakan). Murni urusan tata letak surat, bukan aturan hukum. */
// durasi_hukuman: bagian bersyarat {#durasi_hukuman} di SK — hukuman tanpa masa (mis. teguran) memang tanpa durasi.
export const BOLEH_KOSONG = new Set(["pemotongan_ik_teks", "catatan_perekaman", "nomor_panggilan_2", "tanggal_panggilan_2", "lampiran_surat", "durasi_hukuman"]);
/** Diisi lewat kolom khusus "Nomor surat" & "Tanggal surat" di dialog. */
export const DIISI_DIALOG = new Set(["nomor_surat", "tanggal_surat", "tanggal_surat_panjang", "tahun_surat"]);

export type ItemKatalog = { kode: string; label: string; kelompok: string; jenis: "teks" | "loop"; sumber: string; contoh: string | null; field: { kode: string; label: string }[] | null };
export type VersiTemplate = { id: string; versi: number; file_path: string; placeholder: PlaceholderTemplate[]; pemetaan: Pemetaan };
export type TemplateRingkas = { id: string; kode: string; nama: string; jenis_dokumen: string; tahap_kode: string[]; rezim_kode: string[]; tingkat_kode: string[] };

export async function muatKatalog(db: Sql = sql): Promise<Map<string, ItemKatalog>> {
  const rows = await db`select kode, label, kelompok, jenis, sumber, contoh, field from template_placeholder order by urutan, kode`;
  return new Map(rows.map((r) => [r.kode as string, r as unknown as ItemKatalog]));
}

/** Pemetaan efektif sebuah placeholder template (pemetaan versi → katalog dengan kode sama → isian manual). */
export function pemetaanEfektif(p: PlaceholderTemplate, pemetaan: Pemetaan, katalog: Map<string, ItemKatalog>): Pemetaan[string] {
  const pm = pemetaan?.[p.kode];
  if (pm?.sumber === "katalog" && katalog.has(pm.katalog)) return pm;
  if (pm?.sumber === "manual") return pm;
  return katalog.has(p.kode) ? { sumber: "katalog", katalog: p.kode } : { sumber: "manual", label: labelDariKode(p.kode) };
}

function kosongNilai(v: unknown) {
  return v === null || v === undefined || (typeof v === "string" && !v.trim()) || (Array.isArray(v) && v.length === 0);
}

/** Daftar isian yang harus ditanyakan: placeholder manual + placeholder katalog yang hasilnya kosong. */
export function cariKosong(versi: Pick<VersiTemplate, "placeholder" | "pemetaan">, nilai: Record<string, unknown>, katalog: Map<string, ItemKatalog>): IsianKosong[] {
  const hasil: IsianKosong[] = [];
  const peta = (versi.placeholder ?? []).map((p) => pemetaanEfektif(p, versi.pemetaan, katalog));
  // Template SK tanpa {nomor_surat}: kolom "Nomor/Tanggal surat" di dialog mengisi nomor_sk/tanggal_sk (lihat susunData).
  const adaNomorSurat = peta.some((pm) => pm.sumber === "katalog" && pm.katalog === "nomor_surat");
  for (const [i, p] of (versi.placeholder ?? []).entries()) {
    const pm = peta[i];
    if (pm.sumber === "manual") {
      hasil.push({ kode: p.kode, label: pm.label || labelDariKode(p.kode), jenis: p.jenis, field: p.jenis === "loop" ? p.field : undefined });
      continue;
    }
    if (BOLEH_KOSONG.has(pm.katalog) || DIISI_DIALOG.has(pm.katalog)) continue;
    if (!adaNomorSurat && (pm.katalog === "nomor_sk" || pm.katalog === "tanggal_sk")) continue;
    if (!kosongNilai(nilai[pm.katalog])) continue;
    const k = katalog.get(pm.katalog)!;
    const jenis = k.jenis === "loop" ? "loop" : "teks";
    hasil.push({ kode: p.kode, label: k.label, jenis, field: jenis === "loop" ? (k.field?.map((f) => f.kode) ?? p.field) : undefined });
  }
  return hasil;
}

/**
 * Isian loop dari formulir: satu baris = satu butir; kolom dipisah "|".
 * Kolom "nomor" dan "huruf" diisi otomatis (1, 2, 3 … / a, b, c …).
 */
export function uraiIsianLoop(isi: string, field: string[]): Record<string, string>[] {
  const kolom = field.filter((f) => f !== "nomor" && f !== "huruf");
  return isi
    .split(/\r?\n/)
    .map((b) => b.trim())
    .filter(Boolean)
    .map((b, i) => {
      const bagian = b.split("|").map((x) => x.trim());
      const row: Record<string, string> = {};
      for (const f of field) {
        if (f === "nomor") row[f] = String(i + 1);
        else if (f === "huruf") row[f] = "abcdefghijklmnopqrstuvwxyz"[i] ?? String(i + 1);
      }
      kolom.forEach((f, j) => (row[f] = j === kolom.length - 1 ? bagian.slice(j).join(" | ") : (bagian[j] ?? "")));
      return row;
    });
}

/**
 * Menyusun data render: seluruh nilai konteks (agar tag bersarang/kondisional tetap
 * terisi) + nilai per placeholder sesuai pemetaan + isian manual. Isian manual HANYA
 * diterapkan pada placeholder yang memang kosong/manual — nilai dari data kasus
 * (mis. pasal_dilanggar) tidak bisa ditimpa dari formulir.
 */
export function susunData(
  versi: Pick<VersiTemplate, "placeholder" | "pemetaan">,
  nilai: Record<string, unknown>,
  katalog: Map<string, ItemKatalog>,
  isian: Record<string, string> = {},
  surat: { nomor?: string | null; tanggal?: string | null } = {},
): Record<string, unknown> {
  const data: Record<string, unknown> = { ...nilai };
  if (surat.nomor !== undefined) data.nomor_surat = (surat.nomor ?? "").trim();
  if (surat.tanggal) {
    data.tanggal_surat = tanggalAngka(surat.tanggal);
    data.tanggal_surat_panjang = tanggalPanjang(surat.tanggal);
    data.tahun_surat = surat.tanggal.slice(0, 4);
  }
  const kosong = new Map(cariKosong(versi, data, katalog).map((k) => [k.kode, k]));
  for (const p of versi.placeholder ?? []) {
    const pm = pemetaanEfektif(p, versi.pemetaan, katalog);
    if (pm.sumber === "katalog") data[p.kode] = data[pm.katalog] ?? (katalog.get(pm.katalog)?.jenis === "loop" ? [] : "");
    else data[p.kode] = p.jenis === "loop" ? [] : "";
    const k = kosong.get(p.kode);
    const masuk = isian[p.kode];
    if (k && typeof masuk === "string" && masuk.trim()) {
      data[p.kode] = k.jenis === "loop" ? uraiIsianLoop(masuk, k.field?.length ? k.field : ["teks"]) : masuk.trim();
    }
  }
  // SK: nomor/tanggal dialog juga mengisi nomor_sk/tanggal_sk bila belum tercatat di data hukuman.
  const pakai = new Set((versi.placeholder ?? []).map((p) => p.kode));
  if (pakai.has("nomor_sk") && !data.nomor_sk && surat.nomor) data.nomor_sk = surat.nomor.trim();
  if (pakai.has("tanggal_sk") && !data.tanggal_sk && surat.tanggal) data.tanggal_sk = tanggalPanjang(surat.tanggal);
  return data;
}

/** Judul dokumen: "Surat Panggilan I / II" → "Surat Panggilan II" sesuai tahap. */
export function judulDokumen(nama: string, data: Record<string, unknown>) {
  const urut = typeof data.urutan_panggilan === "string" && data.urutan_panggilan ? data.urutan_panggilan : "I";
  return nama.replace(/\bI\s*\/\s*II\b/, urut).trim();
}

/** "SIMPEL-HD-2026-0007 - Surat Panggilan I.docx" */
export function namaBerkasUnduh(nomorRegistrasi: string, judul: string, versi = 1) {
  const bersih = (s: string) => s.replace(/[\\/:*?"<>|]+/g, "-").replace(/\s+/g, " ").trim();
  return `${bersih(nomorRegistrasi)} - ${bersih(judul)}${versi > 1 ? ` (v${versi})` : ""}.docx`;
}

async function muatTemplate(templateId: string, db: Sql) {
  const [t] = await db`select id, kode, nama, jenis_dokumen, tahap_kode, rezim_kode, tingkat_kode, versi_aktif_id, aktif, diarsipkan_pada
    from template_dokumen where id = ${templateId}`;
  if (!t || t.diarsipkan_pada) throw new GalatPengguna("Template dokumen tidak ditemukan.");
  if (!t.versi_aktif_id) throw new GalatPengguna(`Template "${t.nama}" belum memiliki versi aktif. Hubungi admin.`);
  const [v] = await db`select id, versi, file_path, placeholder, pemetaan from template_versi where id = ${t.versi_aktif_id}`;
  if (!v) throw new GalatPengguna(`Versi aktif template "${t.nama}" tidak ditemukan.`);
  return { template: t as unknown as TemplateRingkas & { versi_aktif_id: string }, versi: v as unknown as VersiTemplate };
}

/** Tahap kasus tempat dokumen ini dibuat: tahap yang sedang berjalan & cocok dengan tahap template. */
async function tentukanTahap(entriId: string, tahapKode: string[], tahapanId: string | null | undefined, db: Sql) {
  if (tahapanId) {
    const [t] = await db`select id from tahapan_kasus where id = ${tahapanId} and entri_id = ${entriId}`;
    if (!t) throw new GalatPengguna("Tahap kasus tidak ditemukan.");
    return tahapanId;
  }
  if (!tahapKode?.length) return null;
  const [t] = await db`select id from tahapan_kasus where entri_id = ${entriId} and kode_tahap in ${db(tahapKode)}
    order by (status = 'berjalan') desc, (status = 'belum') asc, urutan desc limit 1`;
  return (t?.id as string | undefined) ?? null;
}

export type Persiapan = {
  template: { id: string; kode: string; nama: string; jenis_dokumen: string };
  versiId: string;
  versi: number;
  tahapanId: string | null;
  judul: string;
  nilai: Record<string, unknown>;
  kosong: IsianKosong[];
  /** Ringkasan nilai terisi otomatis untuk ditampilkan di dialog. */
  terisi: { kode: string; label: string; nilai: string }[];
  /** Isian manual yang pernah dipakai dokumen lain kasus ini (saran pengisian). */
  saran: Record<string, string>;
};

function ringkasNilai(v: unknown): string {
  if (Array.isArray(v)) return `${v.length} baris`;
  return typeof v === "string" ? v : "";
}

async function muat(m: { entriId: string; templateId: string; sesiId?: string | null; tahapanId?: string | null; penggunaNama?: string; db?: Sql }) {
  const db = m.db ?? sql;
  const [e] = await db`select id, nomor_registrasi from entri where id = ${m.entriId}`;
  if (!e) throw new GalatPengguna("Kasus tidak ditemukan.");
  const { template, versi } = await muatTemplate(m.templateId, db);
  const tahapanId = await tentukanTahap(m.entriId, template.tahap_kode, m.tahapanId, db);
  const [konteks, katalog] = await Promise.all([
    konteksDokumen(m.entriId, { sesiId: m.sesiId, tahapanId, penggunaNama: m.penggunaNama, db }),
    muatKatalog(db),
  ]);
  return { db, entri: e as { id: string; nomor_registrasi: string }, template, versi, tahapanId, konteks, katalog };
}

export async function siapkanDokumen(m: {
  entriId: string; templateId: string; sesiId?: string | null; tahapanId?: string | null; penggunaNama?: string; db?: Sql;
}): Promise<Persiapan> {
  const { db, template, versi, tahapanId, konteks, katalog } = await muat(m);
  const lama = await db`select data_isian from dokumen where entri_id = ${m.entriId} and diarsipkan_pada is null order by created_at desc limit 30`;
  const nilai = susunData(versi, konteks, katalog);
  const kosong = cariKosong(versi, konteks, katalog);
  const terisi = (versi.placeholder ?? [])
    .filter((p) => !kosong.some((k) => k.kode === p.kode))
    .map((p) => {
      const pm = pemetaanEfektif(p, versi.pemetaan, katalog);
      const label = pm.sumber === "katalog" ? (katalog.get(pm.katalog)?.label ?? p.kode) : pm.label;
      return { kode: p.kode, label, nilai: ringkasNilai(nilai[p.kode]) };
    });
  const saran: Record<string, string> = {};
  for (const k of kosong) {
    for (const d of lama) {
      const s = ((d.data_isian as { isian?: Record<string, string> } | null)?.isian ?? {})[k.kode];
      if (typeof s === "string" && s.trim()) {
        saran[k.kode] = s;
        break;
      }
    }
  }
  return {
    template: { id: template.id, kode: template.kode, nama: template.nama, jenis_dokumen: template.jenis_dokumen },
    versiId: versi.id, versi: versi.versi, tahapanId, judul: judulDokumen(template.nama, nilai), nilai, kosong, terisi, saran,
  };
}

type MasukanBuat = {
  entriId: string; templateId: string; tahapanId?: string | null; sesiId?: string | null; isian?: Record<string, string>;
  nomor?: string | null; tanggal?: string | null; status?: "draf" | "final";
};

/** Merender dokumen tanpa menyimpan (pratinjau di dialog; juga dipakai buatDokumen). */
export async function renderDokumen(m: MasukanBuat, pengguna: { nama: string }) {
  const { entri, template, versi, tahapanId, konteks, katalog } = await muat({ ...m, penggunaNama: pengguna.nama });
  const data = susunData(versi, konteks, katalog, m.isian ?? {}, { nomor: m.nomor ?? "", tanggal: m.tanggal ?? null });
  const isi = isiTemplate(await unduhBerkas(versi.file_path), data);
  const judul = judulDokumen(template.nama, data);
  return { isi, data, entri, template, versi, tahapanId, judul };
}

export async function buatDokumen(m: MasukanBuat, pengguna: { id: string; email: string; nama: string }): Promise<{ dokumenId: string }> {
  if (m.tanggal && !/^\d{4}-\d{2}-\d{2}$/.test(m.tanggal)) throw new GalatPengguna("Format tanggal surat tidak valid.");
  const { isi, data, entri, template, versi, tahapanId, judul } = await renderDokumen(m, pengguna);
  const [{ n }] = await sql`select coalesce(max(versi), 0)::int + 1 as n from dokumen
    where entri_id = ${m.entriId} and template_id = ${template.id} and tahapan_id is not distinct from ${tahapanId}`;
  const dokumenId = randomUUID();
  const path = `entri/${m.entriId}/dokumen/${dokumenId}-v${n}.docx`;
  await unggahBerkas(path, isi, MIME_DOCX);
  const status = m.status === "final" ? "final" : "draf";
  try {
    await transaksi(async (tx) => {
      await tx`insert into dokumen (id, entri_id, tahapan_id, jenis_dokumen, judul, nomor, tanggal, template_id, template_versi_id,
          data_isian, snapshot_data, file_path, versi, status, dibuat_oleh, created_by, updated_by)
        values (${dokumenId}, ${m.entriId}, ${tahapanId}, ${template.jenis_dokumen}, ${judul}, ${m.nomor?.trim() || null},
          ${m.tanggal || null}, ${template.id}, ${versi.id},
          ${tx.json({ isian: m.isian ?? {}, sesi_id: m.sesiId ?? null } as never)}, ${tx.json(data as never)}, ${path}, ${n}, ${status},
          ${pengguna.id}, ${pengguna.id}, ${pengguna.id})`;
      await catatAudit(pengguna, {
        aksi: "buat", tabel: "dokumen", record_id: dokumenId, entri_id: m.entriId,
        ringkasan: { judul, nomor: m.nomor ?? null, versi: n, status, template: template.kode, template_versi: versi.versi, nomor_registrasi: entri.nomor_registrasi },
      }, tx);
    });
  } catch (err) {
    await hapusBerkas([path]).catch(() => {});
    throw err;
  }
  return { dokumenId };
}

/** Buat ulang (versi+1) dari dokumen lama: data kasus terkini + isian manual yang sama. */
export async function buatUlangDokumen(dokumenId: string, pengguna: { id: string; email: string; nama: string }) {
  const [d] = await sql`select entri_id, template_id, tahapan_id, data_isian, nomor, tanggal from dokumen where id = ${dokumenId}`;
  if (!d || !d.template_id) throw new GalatPengguna("Dokumen tidak ditemukan atau tidak berasal dari template.");
  const di = (d.data_isian ?? {}) as { isian?: Record<string, string>; sesi_id?: string | null };
  return buatDokumen({
    entriId: d.entri_id, templateId: d.template_id, tahapanId: d.tahapan_id, sesiId: di.sesi_id ?? null,
    isian: di.isian ?? {}, nomor: d.nomor, tanggal: d.tanggal, status: "draf",
  }, pengguna);
}

/** BAP langsung dari sesi mode sidang (terperiksa tidak hadir → template berita acara ketidakhadiran bila tersedia). */
export async function buatBapDariSesi(sesiId: string, pengguna: { id: string; email: string; nama: string }): Promise<{ dokumenId: string }> {
  const [s] = await sql`select s.entri_id, s.terperiksa_hadir, e.rezim_kode from sesi_pemeriksaan s join entri e on e.id = s.entri_id where s.id = ${sesiId}`;
  if (!s) throw new GalatPengguna("Sesi pemeriksaan tidak ditemukan.");
  const jenis = s.terperiksa_hadir === false ? ["bap_tidak_hadir", "bap"] : ["bap"];
  const kandidat = await sql`select id, jenis_dokumen from template_dokumen
    where jenis_dokumen in ${sql(jenis)} and aktif and diarsipkan_pada is null and versi_aktif_id is not null
      and (cardinality(rezim_kode) = 0 or ${s.rezim_kode ?? ""} = any(rezim_kode))
    order by urutan, created_at`;
  const t = jenis.map((j) => kandidat.find((k) => k.jenis_dokumen === j)).find(Boolean);
  if (!t) throw new GalatPengguna("Template Berita Acara Pemeriksaan yang aktif belum tersedia. Hubungi admin.");
  const [tahap] = await sql`select id from tahapan_kasus where entri_id = ${s.entri_id} and kode_tahap in ('bap', 'pemeriksaan')
    order by (kode_tahap = 'bap') desc, urutan limit 1`;
  return buatDokumen({ entriId: s.entri_id, templateId: t.id, sesiId, tahapanId: tahap?.id ?? null, status: "draf" }, pengguna);
}

/** "Cetak ulang persis": render ulang dari snapshot_data + template_versi_id — bukan dari data terkini. */
export async function renderUlangPersis(dokumenId: string) {
  const [d] = await sql`select d.snapshot_data, v.file_path from dokumen d join template_versi v on v.id = d.template_versi_id where d.id = ${dokumenId}`;
  if (!d?.snapshot_data) throw new GalatPengguna("Dokumen ini tidak memiliki salinan beku untuk dicetak ulang.");
  return isiTemplate(await unduhBerkas(d.file_path), d.snapshot_data as Record<string, unknown>);
}

/** Data contoh untuk tombol "Uji" di admin template: `contoh` katalog atau "[kode]"; isian manual "[label]". */
export function dataContoh(versi: Pick<VersiTemplate, "placeholder" | "pemetaan">, katalog: Map<string, ItemKatalog>): Record<string, unknown> {
  const baris = (awalan: string, field: string[]) =>
    [1, 2].map((i) =>
      Object.fromEntries(field.map((f) => [f, f === "nomor" ? String(i) : f === "huruf" ? "ab"[i - 1] : `[${awalan}.${f} ${i}]`])),
    );
  const data: Record<string, unknown> = {};
  for (const k of katalog.values()) {
    data[k.kode] = k.jenis === "loop" ? baris(k.kode, k.field?.map((f) => f.kode) ?? []) : k.contoh?.trim() || `[${k.kode}]`;
  }
  for (const p of versi.placeholder ?? []) {
    const pm = pemetaanEfektif(p, versi.pemetaan, katalog);
    if (pm.sumber === "katalog") {
      data[p.kode] = data[pm.katalog];
    } else {
      data[p.kode] = p.jenis === "loop" ? baris(p.kode, p.field) : `[${pm.label || p.kode}]`;
      for (const f of p.field ?? []) if (!(f in data)) data[f] = `[${f}]`;
    }
  }
  return data;
}
