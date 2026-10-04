"use server";

import { revalidatePath } from "next/cache";
import { wajibHak, type Pengguna } from "@/lib/auth";
import { sql, transaksi, type Sql } from "@/lib/db";
import { catatAudit } from "@/lib/audit";
import { GalatPengguna, jalankan } from "@/lib/galat";

const BAGIAN = ["pembuka", "substansi", "penutup"];

function segarkan() {
  revalidatePath("/pengaturan/pertanyaan");
}

function teksSah(t: string) {
  const x = t.trim().replace(/\s+/g, " ");
  if (x.length < 5) throw new GalatPengguna("Pertanyaan minimal 5 huruf.");
  if (x.length > 2000) throw new GalatPengguna("Pertanyaan terlalu panjang (maks. 2.000 huruf).");
  return x;
}

/** Penomoran ulang pertanyaan baku: pembuka → substansi → penutup, berurutan 1..n. */
async function nomoriUlangBaku(tx: Sql, urutan?: string[]) {
  const rows = urutan
    ? urutan.map((id) => ({ id }))
    : await tx`select id from pertanyaan_baku order by array_position(${BAGIAN}::text[], bagian), urutan, created_at`;
  for (const [i, r] of rows.entries()) await tx`update pertanyaan_baku set urutan = ${i + 1} where id = ${r.id} and urutan <> ${i + 1}`;
}

// ---------------------------------------------------------------- pertanyaan baku

export async function tambahBaku(bagian: string, pertanyaan: string) {
  return jalankan(async () => {
    const p = await wajibHak("kelola_pengaturan");
    if (!BAGIAN.includes(bagian)) throw new GalatPengguna("Bagian tidak valid.");
    const teks = teksSah(pertanyaan);
    await transaksi(async (tx) => {
      const [{ m }] = await tx`select coalesce(max(urutan), 0)::int as m from pertanyaan_baku where bagian = ${bagian}`;
      const [r] = await tx`insert into pertanyaan_baku (bagian, urutan, pertanyaan, created_by, updated_by)
        values (${bagian}, ${m}, ${teks}, ${p.id}, ${p.id}) returning id`;
      // letakkan di akhir bagiannya (seri urutan → baris baru di belakang) lalu nomori ulang
      const ids = (await tx`select id from pertanyaan_baku order by array_position(${BAGIAN}::text[], bagian), urutan, (id = ${r.id}), created_at`).map((x) => x.id as string);
      await nomoriUlangBaku(tx, ids);
      await catatAudit(p, { aksi: "buat", tabel: "pertanyaan_baku", record_id: r.id, ringkasan: { bagian, pertanyaan: teks } }, tx);
    });
    segarkan();
  }, "Pertanyaan baku ditambahkan");
}

export async function ubahBaku(id: string, isian: { pertanyaan: string; bagian: string; aktif: boolean }) {
  return jalankan(async () => {
    const p = await wajibHak("kelola_pengaturan");
    if (!BAGIAN.includes(isian.bagian)) throw new GalatPengguna("Bagian tidak valid.");
    const teks = teksSah(isian.pertanyaan);
    await transaksi(async (tx) => {
      const [lama] = await tx`select bagian, pertanyaan, aktif from pertanyaan_baku where id = ${id}`;
      if (!lama) throw new GalatPengguna("Pertanyaan tidak ditemukan.");
      await tx`update pertanyaan_baku set pertanyaan = ${teks}, bagian = ${isian.bagian}, aktif = ${!!isian.aktif}, updated_by = ${p.id} where id = ${id}`;
      if (lama.bagian !== isian.bagian) await nomoriUlangBaku(tx);
      const ringkasan: Record<string, unknown> = {};
      if (lama.pertanyaan !== teks) ringkasan.pertanyaan = { sebelum: lama.pertanyaan, sesudah: teks };
      if (lama.bagian !== isian.bagian) ringkasan.bagian = { sebelum: lama.bagian, sesudah: isian.bagian };
      if (lama.aktif !== !!isian.aktif) ringkasan.aktif = { sebelum: lama.aktif, sesudah: !!isian.aktif };
      await catatAudit(p, { aksi: "ubah", tabel: "pertanyaan_baku", record_id: id, ringkasan }, tx);
    });
    segarkan();
  }, "Pertanyaan baku diperbarui");
}

export async function aktifkanBaku(id: string, aktif: boolean) {
  return jalankan(async () => {
    const p = await wajibHak("kelola_pengaturan");
    await transaksi(async (tx) => {
      const [r] = await tx`update pertanyaan_baku set aktif = ${aktif}, updated_by = ${p.id} where id = ${id} returning id`;
      if (!r) throw new GalatPengguna("Pertanyaan tidak ditemukan.");
      await catatAudit(p, { aksi: "ubah", tabel: "pertanyaan_baku", record_id: id, ringkasan: { aktif: { sebelum: !aktif, sesudah: aktif } } }, tx);
    });
    segarkan();
  }, aktif ? "Pertanyaan diaktifkan" : "Pertanyaan dinonaktifkan");
}

/** Geser pertanyaan baku satu langkah ke atas/bawah di dalam bagiannya. */
export async function geserBaku(id: string, arah: "naik" | "turun") {
  return jalankan(async () => {
    const p = await wajibHak("kelola_pengaturan");
    await transaksi(async (tx) => {
      const rows = (await tx`select id, bagian from pertanyaan_baku order by array_position(${BAGIAN}::text[], bagian), urutan, created_at for update`) as unknown as { id: string; bagian: string }[];
      const i = rows.findIndex((r) => r.id === id);
      if (i < 0) throw new GalatPengguna("Pertanyaan tidak ditemukan.");
      const j = arah === "naik" ? i - 1 : i + 1;
      if (j < 0 || j >= rows.length || rows[j].bagian !== rows[i].bagian) return;
      [rows[i], rows[j]] = [rows[j], rows[i]];
      await nomoriUlangBaku(tx, rows.map((r) => r.id));
      await catatAudit(p, { aksi: "ubah", tabel: "pertanyaan_baku", record_id: id, ringkasan: { urutan: arah === "naik" ? "dinaikkan satu langkah" : "diturunkan satu langkah" } }, tx);
    });
    segarkan();
  });
}

// ---------------------------------------------------------------- bank pertanyaan

async function nomoriUlangSet(tx: Sql, namaSet: string, ids?: string[]) {
  const urut = ids ?? (await tx`select id from bank_pertanyaan where nama_set = ${namaSet} order by urutan, created_at`).map((r) => r.id as string);
  for (const [i, id] of urut.entries()) await tx`update bank_pertanyaan set urutan = ${i + 1} where id = ${id} and urutan <> ${i + 1}`;
}

function rapikanSet(nama: string, jenis: string) {
  const n = nama.trim().replace(/\s+/g, " ");
  if (n.length < 3) throw new GalatPengguna("Nama set minimal 3 huruf.");
  return { nama_set: n, jenis_pelanggaran: jenis.trim() || null };
}

function pecahBaris(teks: string) {
  return teks.split(/\r?\n/).map((x) => x.replace(/^\s*(\d+[.)]|[-•*])\s*/, "").trim()).filter((x) => x.length >= 5);
}

export async function buatSet(nama: string, jenis: string, daftar: string) {
  return jalankan(async () => {
    const p = await wajibHak("kelola_pengaturan");
    const s = rapikanSet(nama, jenis);
    const butir = pecahBaris(daftar).map(teksSah);
    if (!butir.length) throw new GalatPengguna("Isi sedikitnya satu pertanyaan (satu pertanyaan per baris).");
    const [ada] = await sql`select 1 from bank_pertanyaan where lower(nama_set) = lower(${s.nama_set}) limit 1`;
    if (ada) throw new GalatPengguna("Nama set sudah dipakai. Pilih nama lain atau tambahkan pertanyaan ke set tersebut.");
    await transaksi(async (tx) => {
      for (const [i, t] of butir.entries()) {
        await tx`insert into bank_pertanyaan (nama_set, jenis_pelanggaran, urutan, pertanyaan, created_by, updated_by)
          values (${s.nama_set}, ${s.jenis_pelanggaran}, ${i + 1}, ${t}, ${p.id}, ${p.id})`;
      }
      await catatAudit(p, { aksi: "buat", tabel: "bank_pertanyaan", record_id: s.nama_set, ringkasan: { ...s, jumlah_pertanyaan: butir.length } }, tx);
    });
    segarkan();
  }, "Set pertanyaan dibuat");
}

export async function ubahSet(namaLama: string, nama: string, jenis: string, aktif: boolean) {
  return jalankan(async () => {
    const p = await wajibHak("kelola_pengaturan");
    const s = rapikanSet(nama, jenis);
    if (s.nama_set.toLowerCase() !== namaLama.toLowerCase()) {
      const [ada] = await sql`select 1 from bank_pertanyaan where lower(nama_set) = lower(${s.nama_set}) limit 1`;
      if (ada) throw new GalatPengguna("Nama set sudah dipakai.");
    }
    await transaksi(async (tx) => {
      const [lama] = await tx`select jenis_pelanggaran, bool_or(aktif) as aktif from bank_pertanyaan where nama_set = ${namaLama} group by jenis_pelanggaran limit 1`;
      if (!lama) throw new GalatPengguna("Set tidak ditemukan.");
      await tx`update bank_pertanyaan set nama_set = ${s.nama_set}, jenis_pelanggaran = ${s.jenis_pelanggaran}, aktif = ${aktif}, updated_by = ${p.id} where nama_set = ${namaLama}`;
      await catatAudit(p, {
        aksi: "ubah", tabel: "bank_pertanyaan", record_id: s.nama_set,
        ringkasan: {
          nama_set: { sebelum: namaLama, sesudah: s.nama_set },
          jenis_pelanggaran: { sebelum: lama.jenis_pelanggaran, sesudah: s.jenis_pelanggaran },
          aktif: { sebelum: lama.aktif, sesudah: aktif },
        },
      }, tx);
    });
    segarkan();
  }, "Set pertanyaan diperbarui");
}

async function satuButir(tx: Sql, id: string) {
  const [r] = await tx`select id, nama_set, jenis_pelanggaran, pertanyaan, aktif from bank_pertanyaan where id = ${id}`;
  if (!r) throw new GalatPengguna("Pertanyaan tidak ditemukan.");
  return r;
}

export async function tambahButir(namaSet: string, pertanyaan: string) {
  return jalankan(async () => {
    const p = await wajibHak("kelola_pengaturan");
    const teks = teksSah(pertanyaan);
    await transaksi(async (tx) => {
      const [s] = await tx`select jenis_pelanggaran, coalesce(max(urutan), 0)::int as m from bank_pertanyaan where nama_set = ${namaSet} group by jenis_pelanggaran limit 1`;
      if (!s) throw new GalatPengguna("Set tidak ditemukan.");
      const [r] = await tx`insert into bank_pertanyaan (nama_set, jenis_pelanggaran, urutan, pertanyaan, created_by, updated_by)
        values (${namaSet}, ${s.jenis_pelanggaran}, ${s.m + 1}, ${teks}, ${p.id}, ${p.id}) returning id`;
      await catatAudit(p, { aksi: "buat", tabel: "bank_pertanyaan", record_id: r.id, ringkasan: { nama_set: namaSet, pertanyaan: teks } }, tx);
    });
    segarkan();
  }, "Pertanyaan ditambahkan ke set");
}

export async function ubahButir(id: string, pertanyaan: string, aktif: boolean) {
  return jalankan(async () => {
    const p = await wajibHak("kelola_pengaturan");
    const teks = teksSah(pertanyaan);
    await transaksi(async (tx) => {
      const lama = await satuButir(tx, id);
      await tx`update bank_pertanyaan set pertanyaan = ${teks}, aktif = ${aktif}, updated_by = ${p.id} where id = ${id}`;
      const ringkasan: Record<string, unknown> = { nama_set: lama.nama_set };
      if (lama.pertanyaan !== teks) ringkasan.pertanyaan = { sebelum: lama.pertanyaan, sesudah: teks };
      if (lama.aktif !== aktif) ringkasan.aktif = { sebelum: lama.aktif, sesudah: aktif };
      await catatAudit(p, { aksi: "ubah", tabel: "bank_pertanyaan", record_id: id, ringkasan }, tx);
    });
    segarkan();
  }, "Pertanyaan diperbarui");
}

/** Bank pertanyaan hanyalah contoh siap pakai (disalin ke sesi saat dipakai), jadi butir boleh dihapus. */
export async function hapusButir(id: string) {
  return jalankan(async () => {
    const p = await wajibHak("kelola_pengaturan");
    await transaksi(async (tx) => {
      const lama = await satuButir(tx, id);
      const [{ n }] = await tx`select count(*)::int as n from bank_pertanyaan where nama_set = ${lama.nama_set}`;
      if (n <= 1) throw new GalatPengguna("Ini pertanyaan terakhir di set. Nonaktifkan set-nya saja bila tidak dipakai lagi.");
      await tx`delete from bank_pertanyaan where id = ${id}`;
      await nomoriUlangSet(tx, lama.nama_set);
      await catatAudit(p, { aksi: "hapus", tabel: "bank_pertanyaan", record_id: id, ringkasan: { nama_set: lama.nama_set, pertanyaan: lama.pertanyaan } }, tx);
    });
    segarkan();
  }, "Pertanyaan dihapus dari set");
}

export async function geserButir(id: string, arah: "naik" | "turun") {
  return jalankan(async () => {
    const p: Pengguna = await wajibHak("kelola_pengaturan");
    await transaksi(async (tx) => {
      const lama = await satuButir(tx, id);
      const ids = (await tx`select id from bank_pertanyaan where nama_set = ${lama.nama_set} order by urutan, created_at for update`).map((r) => r.id as string);
      const i = ids.indexOf(id);
      const j = arah === "naik" ? i - 1 : i + 1;
      if (j < 0 || j >= ids.length) return;
      [ids[i], ids[j]] = [ids[j], ids[i]];
      await nomoriUlangSet(tx, lama.nama_set, ids);
      await catatAudit(p, { aksi: "ubah", tabel: "bank_pertanyaan", record_id: id, ringkasan: { nama_set: lama.nama_set, urutan: arah === "naik" ? "dinaikkan satu langkah" : "diturunkan satu langkah" } }, tx);
    });
    segarkan();
  });
}
