"use server";

import { revalidatePath } from "next/cache";
import { wajibHak } from "@/lib/auth";
import { sql, transaksi } from "@/lib/db";
import { catatAudit, selisih } from "@/lib/audit";
import { GalatPengguna, jalankan } from "@/lib/galat";
import { hapusBerkas, namaAman, unduhBerkas, urlUnggahTertanda } from "@/lib/penyimpanan";
import { isiTemplate, labelDariKode, petakanOtomatis, pindaiPlaceholder, type Pemetaan, type PlaceholderTemplate } from "@/lib/dokumen/template";
import { dataContoh, muatKatalog } from "@/lib/dokumen/buat";
import { POLA_KODE } from "./_util";

const BATAS_MB = 15;

function segarkan(id?: string) {
  revalidatePath("/pengaturan/template");
  if (id) revalidatePath(`/pengaturan/template/${id}`);
}

function daftarKode(x: unknown): string[] {
  return Array.isArray(x) ? [...new Set(x.filter((s): s is string => typeof s === "string" && /^[A-Za-z0-9_]+$/.test(s)))] : [];
}

/** Tambah template baru (berkas versi pertama diunggah di halaman detail). */
export async function tambahTemplate(m: { kode: string; nama: string; jenis_dokumen: string }) {
  return jalankan(async () => {
    const p = await wajibHak("kelola_pengaturan");
    const kode = m.kode.trim().toLowerCase();
    if (!POLA_KODE.test(kode)) throw new GalatPengguna("Kode template hanya boleh huruf kecil, angka, dan garis bawah (contoh: surat_teguran).");
    if (!m.nama.trim()) throw new GalatPengguna("Nama template wajib diisi.");
    if (!m.jenis_dokumen) throw new GalatPengguna("Pilih jenis dokumen.");
    const [ada] = await sql`select 1 from template_dokumen where kode = ${kode}`;
    if (ada) throw new GalatPengguna("Kode template ini sudah dipakai. Gunakan kode lain.");
    const [{ urutan }] = await sql`select coalesce(max(urutan), 0) + 1 as urutan from template_dokumen`;
    const [t] = await sql`insert into template_dokumen (kode, nama, jenis_dokumen, aktif, urutan, created_by, updated_by)
      values (${kode}, ${m.nama.trim()}, ${m.jenis_dokumen}, true, ${urutan}, ${p.id}, ${p.id}) returning id`;
    await catatAudit(p, { aksi: "buat", tabel: "template_dokumen", record_id: t.id, ringkasan: { kode, nama: m.nama.trim(), jenis_dokumen: m.jenis_dokumen } });
    segarkan();
    return t.id as string;
  }, "Template ditambahkan. Unggah berkas .docx sebagai versi pertama.");
}

/** Metadata template: nama, jenis, rezim, tingkat, tahap, aktif. */
export async function simpanMetadataTemplate(
  id: string,
  m: { nama: string; jenis_dokumen: string; rezim_kode: string[]; tingkat_kode: string[]; tahap_kode: string[]; aktif: boolean; keterangan?: string | null },
) {
  return jalankan(async () => {
    const p = await wajibHak("kelola_pengaturan");
    if (!m.nama.trim()) throw new GalatPengguna("Nama template wajib diisi.");
    const [lama] = await sql`select nama, jenis_dokumen, rezim_kode, tingkat_kode, tahap_kode, aktif, keterangan, versi_aktif_id from template_dokumen where id = ${id}`;
    if (!lama) throw new GalatPengguna("Template tidak ditemukan.");
    const baru = {
      nama: m.nama.trim(), jenis_dokumen: m.jenis_dokumen, rezim_kode: daftarKode(m.rezim_kode), tingkat_kode: daftarKode(m.tingkat_kode),
      tahap_kode: daftarKode(m.tahap_kode), aktif: !!m.aktif, keterangan: m.keterangan?.trim() || null,
    };
    if (baru.aktif && !lama.versi_aktif_id) throw new GalatPengguna("Template belum memiliki versi aktif. Unggah dan aktifkan satu versi lebih dulu.");
    await sql`update template_dokumen set nama = ${baru.nama}, jenis_dokumen = ${baru.jenis_dokumen}, rezim_kode = ${baru.rezim_kode},
        tingkat_kode = ${baru.tingkat_kode}, tahap_kode = ${baru.tahap_kode}, aktif = ${baru.aktif}, keterangan = ${baru.keterangan}, updated_by = ${p.id}
      where id = ${id}`;
    await catatAudit(p, { aksi: "ubah", tabel: "template_dokumen", record_id: id, ringkasan: selisih(lama as Record<string, unknown>, baru) });
    segarkan(id);
  }, "Pengaturan template tersimpan");
}

/** Langkah 1 unggah versi: tautan unggah bertanda (berkas tidak melewati batas ukuran aksi server). */
export async function siapkanUnggahTemplate(templateId: string, info: { nama: string; mime: string; ukuran: number }) {
  return jalankan(async () => {
    await wajibHak("kelola_pengaturan");
    if (!/\.docx$/i.test(info.nama)) throw new GalatPengguna("Berkas harus berformat Word .docx (bukan .doc atau PDF). Simpan ulang di Word sebagai .docx.");
    if (info.ukuran > BATAS_MB * 1024 * 1024) throw new GalatPengguna(`Ukuran berkas melebihi ${BATAS_MB} MB.`);
    const [t] = await sql`select kode from template_dokumen where id = ${templateId}`;
    if (!t) throw new GalatPengguna("Template tidak ditemukan.");
    const path = `template/${t.kode}/unggah-${Date.now()}-${namaAman(info.nama)}`;
    const u = await urlUnggahTertanda(path);
    return { signedUrl: u.signedUrl, path };
  });
}

/** Langkah 2: pindai placeholder, petakan otomatis (melanjutkan pemetaan versi sebelumnya), simpan sebagai versi baru. */
export async function konfirmasiUnggahTemplate(templateId: string, info: { path: string; nama: string; mime: string; ukuran: number }) {
  return jalankan(async () => {
    const p = await wajibHak("kelola_pengaturan");
    const [t] = await sql`select id, kode from template_dokumen where id = ${templateId}`;
    if (!t) throw new GalatPengguna("Template tidak ditemukan.");
    if (!info.path.startsWith(`template/${t.kode}/`)) throw new GalatPengguna("Lokasi berkas tidak valid.");
    let placeholder: PlaceholderTemplate[];
    try {
      placeholder = pindaiPlaceholder(await unduhBerkas(info.path));
    } catch (e) {
      await hapusBerkas([info.path]).catch(() => {});
      throw new GalatPengguna(`Berkas tidak dapat dibaca sebagai template. ${(e as Error).message.replace(/^Berkas template tidak valid:\s*/, "Periksa penanda: ")}`);
    }
    const katalog = await sql`select kode, jenis from template_placeholder`;
    const [sebelum] = await sql`select pemetaan from template_versi where template_id = ${templateId} order by versi desc limit 1`;
    const otomatis = petakanOtomatis(placeholder, katalog as unknown as { kode: string; jenis: string }[]);
    const lama = (sebelum?.pemetaan ?? {}) as Pemetaan;
    const pemetaan: Pemetaan = Object.fromEntries(placeholder.map((ph) => [ph.kode, lama[ph.kode] ?? otomatis[ph.kode]]));
    const versi = await transaksi(async (tx) => {
      const [{ n }] = await tx`select coalesce(max(versi), 0)::int + 1 as n from template_versi where template_id = ${templateId}`;
      const [v] = await tx`insert into template_versi (template_id, versi, file_path, nama_file, ukuran, placeholder, pemetaan, created_by)
        values (${templateId}, ${n}, ${info.path}, ${info.nama}, ${info.ukuran}, ${tx.json(placeholder as never)}, ${tx.json(pemetaan as never)}, ${p.id})
        returning id, versi`;
      await catatAudit(p, { aksi: "buat", tabel: "template_versi", record_id: v.id, ringkasan: { template: t.kode, versi: n, nama_file: info.nama, jumlah_placeholder: placeholder.length } }, tx);
      return v as { id: string; versi: number };
    });
    segarkan(templateId);
    return versi;
  });
}

/** Simpan pemetaan placeholder sebuah versi (ditolak bila versi sudah dipakai dokumen). */
export async function simpanPemetaan(versiId: string, pemetaan: Pemetaan) {
  return jalankan(async () => {
    const p = await wajibHak("kelola_pengaturan");
    const [v] = await sql`select id, template_id, versi, placeholder, pemetaan from template_versi where id = ${versiId}`;
    if (!v) throw new GalatPengguna("Versi template tidak ditemukan.");
    const [{ n }] = await sql`select count(*)::int as n from dokumen where template_versi_id = ${versiId}`;
    if (n > 0) throw new GalatPengguna(`Versi ini sudah dipakai ${n} dokumen sehingga pemetaannya terkunci agar dokumen lama tetap bisa dibuat ulang persis. Unggah ulang berkas yang sama sebagai versi baru untuk mengubah pemetaan.`);
    const katalog = await muatKatalog();
    const bersih: Pemetaan = {};
    for (const ph of v.placeholder as PlaceholderTemplate[]) {
      const pm = pemetaan[ph.kode];
      if (pm?.sumber === "katalog") {
        if (!katalog.has(pm.katalog)) throw new GalatPengguna(`Sumber data "${pm.katalog}" untuk {${ph.kode}} tidak ada di katalog.`);
        bersih[ph.kode] = { sumber: "katalog", katalog: pm.katalog };
      } else {
        const label = (pm?.sumber === "manual" ? pm.label : "").trim() || labelDariKode(ph.kode);
        bersih[ph.kode] = { sumber: "manual", label: label.slice(0, 200) };
      }
    }
    await sql`update template_versi set pemetaan = ${sql.json(bersih as never)} where id = ${versiId}`;
    await catatAudit(p, { aksi: "ubah", tabel: "template_versi", record_id: versiId, ringkasan: selisih(v.pemetaan as Record<string, unknown>, bersih) });
    segarkan(v.template_id);
  }, "Pemetaan placeholder tersimpan");
}

/** Jadikan versi ini versi aktif (dipakai untuk dokumen baru). */
export async function aktifkanVersi(templateId: string, versiId: string) {
  return jalankan(async () => {
    const p = await wajibHak("kelola_pengaturan");
    const [v] = await sql`select versi from template_versi where id = ${versiId} and template_id = ${templateId}`;
    if (!v) throw new GalatPengguna("Versi template tidak ditemukan.");
    const [lama] = await sql`select v.versi from template_dokumen t left join template_versi v on v.id = t.versi_aktif_id where t.id = ${templateId}`;
    await sql`update template_dokumen set versi_aktif_id = ${versiId}, updated_by = ${p.id} where id = ${templateId}`;
    await catatAudit(p, { aksi: "ubah", tabel: "template_dokumen", record_id: templateId, ringkasan: { versi_aktif: { sebelum: lama?.versi ?? null, sesudah: v.versi } } });
    segarkan(templateId);
  }, "Versi aktif diganti. Dokumen baru akan memakai versi ini.");
}

/** Tombol "Uji": dokumen contoh berisi data dummy (contoh katalog / [kode]) untuk diperiksa sebelum diaktifkan. */
export async function ujiVersi(versiId: string) {
  return jalankan(async () => {
    const p = await wajibHak("kelola_pengaturan");
    const [v] = await sql`select v.id, v.versi, v.file_path, v.placeholder, v.pemetaan, t.nama, t.kode from template_versi v
      join template_dokumen t on t.id = v.template_id where v.id = ${versiId}`;
    if (!v) throw new GalatPengguna("Versi template tidak ditemukan.");
    const katalog = await muatKatalog();
    const versi = { placeholder: v.placeholder as PlaceholderTemplate[], pemetaan: v.pemetaan as Pemetaan };
    let isi: Buffer;
    try {
      isi = isiTemplate(await unduhBerkas(v.file_path), dataContoh(versi, katalog));
    } catch (e) {
      throw new GalatPengguna((e as Error).message);
    }
    await catatAudit(p, { aksi: "unduh", tabel: "template_versi", record_id: v.id, ringkasan: { uji: true, template: v.kode, versi: v.versi } });
    return { base64: isi.toString("base64"), nama: `UJI - ${String(v.nama).replace(/[\\/:*?"<>|]+/g, "-")} v${v.versi}.docx` };
  });
}

// ---------------------------------------------------------------------------
// Katalog placeholder
// ---------------------------------------------------------------------------
type MasukanPlaceholder = { kode: string; label: string; kelompok: string; jenis: "teks" | "loop"; sumber: string; deskripsi?: string | null; contoh?: string | null; field?: string | null; aktif?: boolean };

async function validasiSumber(sumber: string) {
  if (sumber === "manual") return;
  if (!sumber.startsWith("pengaturan:")) throw new GalatPengguna("Sumber harus \"isian manual\" atau salah satu kunci Pengaturan.");
  const [ada] = await sql`select 1 from pengaturan where kunci = ${sumber.slice("pengaturan:".length)}`;
  if (!ada) throw new GalatPengguna("Kunci pengaturan tidak ditemukan.");
}

function uraiField(field: string | null | undefined) {
  const daftar = (field ?? "").split(",").map((f) => f.trim().toLowerCase()).filter(Boolean);
  for (const f of daftar) if (!/^[a-z][a-z0-9_]*$/.test(f)) throw new GalatPengguna(`Nama kolom "${f}" tidak valid. Gunakan huruf kecil, angka, dan garis bawah.`);
  return [...new Set(daftar)].map((kode) => ({ kode, label: labelDariKode(kode) }));
}

export async function tambahPlaceholder(m: MasukanPlaceholder) {
  return jalankan(async () => {
    const p = await wajibHak("kelola_pengaturan");
    const kode = m.kode.trim().toLowerCase();
    if (!POLA_KODE.test(kode)) throw new GalatPengguna("Kode placeholder hanya boleh huruf kecil, angka, dan garis bawah, diawali huruf (contoh: nama_saksi).");
    if (!m.label.trim()) throw new GalatPengguna("Label wajib diisi.");
    await validasiSumber(m.sumber);
    const jenis = m.jenis === "loop" && m.sumber === "manual" ? "loop" : "teks";
    const field = jenis === "loop" ? uraiField(m.field) : null;
    if (jenis === "loop" && !field?.length) throw new GalatPengguna("Placeholder perulangan wajib memiliki minimal satu kolom.");
    const [ada] = await sql`select 1 from template_placeholder where kode = ${kode}`;
    if (ada) throw new GalatPengguna("Kode placeholder ini sudah ada di katalog.");
    const [{ urutan }] = await sql`select coalesce(max(urutan), 0) + 1 as urutan from template_placeholder`;
    await sql`insert into template_placeholder (kode, label, kelompok, jenis, sumber, deskripsi, contoh, field, urutan)
      values (${kode}, ${m.label.trim()}, ${m.kelompok.trim() || "Lain-lain"}, ${jenis}, ${m.sumber}, ${m.deskripsi?.trim() || null},
        ${m.contoh?.trim() || null}, ${field ? sql.json(field as never) : null}, ${urutan})`;
    await catatAudit(p, { aksi: "buat", tabel: "template_placeholder", record_id: kode, ringkasan: { kode, label: m.label.trim(), sumber: m.sumber, jenis } });
    revalidatePath("/pengaturan/template", "layout");
  }, "Placeholder ditambahkan ke katalog");
}

/** Ubah placeholder. Placeholder bawaan: kode & sumber tetap; tambahan admin: kode boleh diganti selama belum dipakai template. */
export async function ubahPlaceholder(kodeLama: string, m: MasukanPlaceholder) {
  return jalankan(async () => {
    const p = await wajibHak("kelola_pengaturan");
    const [lama] = await sql`select * from template_placeholder where kode = ${kodeLama}`;
    if (!lama) throw new GalatPengguna("Placeholder tidak ditemukan.");
    if (!m.label.trim()) throw new GalatPengguna("Label wajib diisi.");
    const bawaan = lama.sumber === "bawaan";
    let kode = kodeLama;
    let sumber = lama.sumber as string;
    let field = lama.field;
    if (!bawaan) {
      kode = m.kode.trim().toLowerCase();
      if (!POLA_KODE.test(kode)) throw new GalatPengguna("Kode placeholder hanya boleh huruf kecil, angka, dan garis bawah.");
      await validasiSumber(m.sumber);
      sumber = m.sumber;
      if (lama.jenis === "loop") field = uraiField(m.field);
      if (kode !== kodeLama) {
        const [dipakai] = await sql`select 1 from template_versi where placeholder @> ${sql.json([{ kode: kodeLama }] as never)}
          or exists (select 1 from jsonb_each(pemetaan) e where e.value->>'katalog' = ${kodeLama}) limit 1`;
        if (dipakai) throw new GalatPengguna("Kode tidak dapat diganti karena sudah dipakai template. Tambahkan placeholder baru bila perlu.");
        const [bentrok] = await sql`select 1 from template_placeholder where kode = ${kode}`;
        if (bentrok) throw new GalatPengguna("Kode placeholder baru sudah ada di katalog.");
      }
    }
    const baru = {
      kode, label: m.label.trim(), kelompok: m.kelompok.trim() || lama.kelompok, sumber, deskripsi: m.deskripsi?.trim() || null,
      contoh: m.contoh?.trim() || null, aktif: m.aktif ?? lama.aktif, field,
    };
    await sql`update template_placeholder set kode = ${baru.kode}, label = ${baru.label}, kelompok = ${baru.kelompok}, sumber = ${baru.sumber},
        deskripsi = ${baru.deskripsi}, contoh = ${baru.contoh}, aktif = ${baru.aktif}, field = ${baru.field ? sql.json(baru.field as never) : null}
      where kode = ${kodeLama}`;
    await catatAudit(p, { aksi: "ubah", tabel: "template_placeholder", record_id: kodeLama, ringkasan: selisih(lama as Record<string, unknown>, baru) });
    revalidatePath("/pengaturan/template", "layout");
  }, "Placeholder tersimpan");
}
