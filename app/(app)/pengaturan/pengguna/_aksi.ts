"use server";

import { revalidatePath } from "next/cache";
import { wajibHak, type Pengguna } from "@/lib/auth";
import { sql, transaksi, type Sql } from "@/lib/db";
import { catatAudit, selisih } from "@/lib/audit";
import { GalatPengguna, jalankan, type Hasil } from "@/lib/galat";
import { bandingkanIzin, cabutSesi, daftarIzin, hapusIzin, hapusIzinId, pesanClerk, tambahIzin, type HasilPeriksa } from "@/lib/clerk-izin";

export type IsianPengguna = { email: string; nama: string; jabatan: string; peran_kode: string };
export type HasilSinkron = { peringatan?: string; catatan?: string };

const POLA_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

function rapikan(x: IsianPengguna) {
  const email = x.email.trim().toLowerCase();
  const nama = x.nama.trim().replace(/\s+/g, " ");
  const jabatan = x.jabatan.trim() || null;
  if (!POLA_EMAIL.test(email)) throw new GalatPengguna("Alamat email belum benar. Contoh: nama@um.ac.id");
  if (nama.length < 3) throw new GalatPengguna("Nama minimal 3 huruf.");
  if (!x.peran_kode) throw new GalatPengguna("Pilih peran pengguna.");
  return { email, nama, jabatan, peran_kode: x.peran_kode };
}

async function peranKelola(db: Sql, kode: string) {
  const [r] = await db`select kelola_pengaturan from peran where kode = ${kode}`;
  if (!r) throw new GalatPengguna("Peran tidak ditemukan.");
  return !!r.kelola_pengaturan;
}

/** Tolak perubahan yang membuat SIMPEL tidak lagi punya admin aktif. */
async function pastikanAdminTersisa(db: Sql, kecualiId: string) {
  const [{ n }] = await db`select count(*)::int as n from app_users u join peran p on p.kode = u.peran_kode
    where u.aktif and p.kelola_pengaturan and u.id <> ${kecualiId}`;
  if (n === 0) throw new GalatPengguna("Perubahan ditolak: SIMPEL harus selalu memiliki sedikitnya satu admin aktif. Tambahkan atau aktifkan admin lain lebih dulu.");
}

function segarkan() {
  revalidatePath("/pengaturan/pengguna");
}

/** Gabungkan hasil Clerk ke pesan: bila ada peringatan, toast sukses diganti peringatan di klien. */
function denganPeringatan(h: Hasil<HasilSinkron>): Hasil<HasilSinkron> {
  if (h.ok && h.data.peringatan) return { ...h, pesan: undefined };
  return h;
}

export async function tambahPengguna(isian: IsianPengguna) {
  return denganPeringatan(await jalankan(async (): Promise<HasilSinkron> => {
    const p = await wajibHak("kelola_pengaturan");
    const d = rapikan(isian);
    const [ada] = await sql`select id, aktif from app_users where lower(email) = ${d.email}`;
    if (ada) throw new GalatPengguna(ada.aktif ? "Email ini sudah terdaftar sebagai pengguna." : "Email ini sudah terdaftar tetapi dinonaktifkan. Aktifkan kembali dari daftar pengguna.");
    await peranKelola(sql, d.peran_kode);

    const id = await transaksi(async (tx) => {
      const [u] = await tx`insert into app_users (email, nama, jabatan, peran_kode, aktif, created_by, updated_by)
        values (${d.email}, ${d.nama}, ${d.jabatan}, ${d.peran_kode}, true, ${p.id}, ${p.id}) returning id`;
      await catatAudit(p, { aksi: "buat", tabel: "app_users", record_id: u.id, ringkasan: { ...d } }, tx);
      return u.id as string;
    });

    const hasil = await sinkronTambah(p, id, d.email);
    segarkan();
    return hasil;
  }, "Pengguna ditambahkan dan email-nya dimasukkan ke daftar izin login"));
}

async function sinkronTambah(p: Pengguna, id: string, email: string): Promise<HasilSinkron> {
  try {
    const r = await tambahIzin(email);
    await catatAudit(p, { aksi: "ubah", tabel: "app_users", record_id: id, ringkasan: { daftar_izin_clerk: r === "sudah_ada" ? "sudah ada" : "ditambahkan", email } });
    return {};
  } catch (e) {
    const pesan = pesanClerk(e);
    console.error("[SIMPEL] Clerk tambah izin", e);
    await catatAudit(p, { aksi: "ubah", tabel: "app_users", record_id: id, ringkasan: { daftar_izin_clerk: "gagal ditambahkan", email, keterangan: pesan } });
    return { peringatan: `Tersimpan di SIMPEL, tetapi email belum masuk daftar izin login: ${pesan} Gunakan tombol "Periksa sinkronisasi" untuk mengulang.` };
  }
}

async function sinkronHapus(p: Pengguna, id: string, email: string): Promise<HasilSinkron> {
  const masalah: string[] = [];
  const ringkasan: Record<string, unknown> = { email };
  try {
    const n = await hapusIzin(email);
    ringkasan.daftar_izin_clerk = n ? "dihapus" : "tidak ada di daftar";
  } catch (e) {
    console.error("[SIMPEL] Clerk hapus izin", e);
    ringkasan.daftar_izin_clerk = "gagal dihapus";
    masalah.push(`email belum terhapus dari daftar izin login (${pesanClerk(e)})`);
  }
  try {
    const s = await cabutSesi(email);
    ringkasan.sesi_dicabut = s.sesi;
    ringkasan.akun_clerk = s.akun;
  } catch (e) {
    console.error("[SIMPEL] Clerk cabut sesi", e);
    ringkasan.sesi_dicabut = "gagal";
    masalah.push(`sesi yang sedang terbuka belum dapat diakhiri (${pesanClerk(e)})`);
  }
  await catatAudit(p, { aksi: "ubah", tabel: "app_users", record_id: id, ringkasan });
  if (masalah.length) {
    return { peringatan: `Pengguna sudah dinonaktifkan di SIMPEL dan tidak bisa membuka data apa pun, tetapi ${masalah.join("; ")}. Gunakan "Periksa sinkronisasi" untuk mengulang.` };
  }
  return { catatan: typeof ringkasan.sesi_dicabut === "number" && ringkasan.sesi_dicabut > 0 ? `${ringkasan.sesi_dicabut} sesi yang sedang terbuka telah diakhiri.` : undefined };
}

export async function ubahPengguna(id: string, isian: IsianPengguna) {
  return denganPeringatan(await jalankan(async (): Promise<HasilSinkron> => {
    const p = await wajibHak("kelola_pengaturan");
    const d = rapikan(isian);
    const [lama] = await sql`select id, email, nama, jabatan, peran_kode, aktif, clerk_user_id from app_users where id = ${id}`;
    if (!lama) throw new GalatPengguna("Pengguna tidak ditemukan.");
    const emailBerubah = d.email !== String(lama.email).toLowerCase();
    if (emailBerubah && lama.clerk_user_id) {
      throw new GalatPengguna("Email tidak dapat diubah karena pengguna ini sudah pernah masuk dengan email tersebut. Nonaktifkan pengguna ini lalu tambahkan pengguna baru dengan email yang benar.");
    }
    if (emailBerubah) {
      const [dup] = await sql`select id from app_users where lower(email) = ${d.email} and id <> ${id}`;
      if (dup) throw new GalatPengguna("Email ini sudah dipakai pengguna lain.");
    }

    await transaksi(async (tx) => {
      const kelolaLama = await peranKelola(tx, lama.peran_kode);
      const kelolaBaru = await peranKelola(tx, d.peran_kode);
      if (lama.aktif && kelolaLama && !kelolaBaru) {
        if (id === p.id) throw new GalatPengguna("Anda tidak dapat mencabut hak admin Anda sendiri. Mintalah admin lain melakukannya.");
        await pastikanAdminTersisa(tx, id);
      }
      await tx`update app_users set email = ${d.email}, nama = ${d.nama}, jabatan = ${d.jabatan}, peran_kode = ${d.peran_kode}, updated_by = ${p.id} where id = ${id}`;
      const beda = selisih({ email: lama.email, nama: lama.nama, jabatan: lama.jabatan, peran_kode: lama.peran_kode }, d);
      await catatAudit(p, { aksi: "ubah", tabel: "app_users", record_id: id, ringkasan: beda }, tx);
    });

    let hasil: HasilSinkron = {};
    if (emailBerubah && lama.aktif) {
      const h1 = await sinkronHapus(p, id, lama.email);
      const h2 = await sinkronTambah(p, id, d.email);
      hasil = { peringatan: [h1.peringatan, h2.peringatan].filter(Boolean).join(" ") || undefined };
    }
    segarkan();
    return hasil;
  }, "Data pengguna diperbarui"));
}

export async function aturAktif(id: string, aktif: boolean, alasan: string) {
  return denganPeringatan(await jalankan(async (): Promise<HasilSinkron> => {
    const p = await wajibHak("kelola_pengaturan");
    if (!alasan || alasan.trim().length < 5) throw new GalatPengguna("Tuliskan alasan minimal 5 huruf.");
    const [u] = await sql`select u.id, u.email, u.aktif, p.kelola_pengaturan from app_users u join peran p on p.kode = u.peran_kode where u.id = ${id}`;
    if (!u) throw new GalatPengguna("Pengguna tidak ditemukan.");
    if (u.aktif === aktif) return {};
    if (!aktif && id === p.id) throw new GalatPengguna("Anda tidak dapat menonaktifkan akun Anda sendiri.");

    await transaksi(async (tx) => {
      if (!aktif && u.kelola_pengaturan) await pastikanAdminTersisa(tx, id);
      await tx`update app_users set aktif = ${aktif}, updated_by = ${p.id} where id = ${id}`;
      await catatAudit(p, { aksi: "ubah", tabel: "app_users", record_id: id, alasan: alasan.trim(), ringkasan: { aktif: { sebelum: u.aktif, sesudah: aktif } } }, tx);
    });

    const hasil = aktif ? await sinkronTambah(p, id, u.email) : await sinkronHapus(p, id, u.email);
    segarkan();
    return hasil;
  }, aktif ? "Pengguna diaktifkan kembali dan dapat masuk lagi" : "Pengguna dinonaktifkan; aksesnya langsung dihentikan"));
}

/** Bandingkan pengguna aktif SIMPEL dengan daftar izin login Clerk. */
export async function periksaSinkronisasi() {
  return jalankan(async (): Promise<HasilPeriksa & { nonaktif: string[] }> => {
    await wajibHak("kelola_pengaturan");
    const rows = await sql`select email, aktif from app_users`;
    const aktif = rows.filter((r) => r.aktif).map((r) => String(r.email));
    const nonaktif = rows.filter((r) => !r.aktif).map((r) => String(r.email).toLowerCase());
    try {
      const h = await bandingkanIzin(aktif);
      return { ...h, nonaktif };
    } catch (e) {
      console.error("[SIMPEL] Clerk periksa", e);
      throw new GalatPengguna(pesanClerk(e));
    }
  });
}

/** Perbaiki sinkronisasi: tambahkan email yang kurang, hapus identitas yang berlebih. */
export async function perbaikiSinkronisasi(tambah: string[], hapusId: string[]) {
  return jalankan(async () => {
    const p = await wajibHak("kelola_pengaturan");
    const aktif = new Set((await sql`select lower(email) as email from app_users where aktif`).map((r) => r.email as string));
    const izin = await daftarIzin().catch((e) => { throw new GalatPengguna(pesanClerk(e)); });
    const gagal: string[] = [];
    const ditambah: string[] = [];
    const dihapus: string[] = [];
    for (const email of tambah) {
      const e = email.toLowerCase();
      if (!aktif.has(e)) continue; // hanya pengguna aktif yang boleh ditambahkan
      try {
        await tambahIzin(e);
        ditambah.push(e);
      } catch (er) {
        gagal.push(`${e}: ${pesanClerk(er)}`);
      }
    }
    for (const id of hapusId) {
      const x = izin.find((i) => i.id === id);
      if (!x || aktif.has(x.identifier.toLowerCase())) continue; // jangan pernah menghapus pengguna aktif
      try {
        await hapusIzinId(id);
        dihapus.push(x.identifier);
        await cabutSesi(x.identifier).catch(() => null);
      } catch (er) {
        gagal.push(`${x.identifier}: ${pesanClerk(er)}`);
      }
    }
    await catatAudit(p, { aksi: "ubah", tabel: "app_users", ringkasan: { sinkronisasi_daftar_izin: true, ditambahkan: ditambah, dihapus, gagal } });
    if (gagal.length && !ditambah.length && !dihapus.length) throw new GalatPengguna(`Sinkronisasi gagal. ${gagal[0]}`);
    segarkan();
    return { ditambah: ditambah.length, dihapus: dihapus.length, gagal };
  });
}
