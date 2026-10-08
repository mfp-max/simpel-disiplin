# Panduan Membersihkan Akun & Membangun Ulang SIMPEL

Tujuan: akun Vercel, Supabase, Clerk, dan GitHub hanya berisi aplikasi UM, tertata rapi, lalu SIMPEL dipasang ulang dan berfungsi normal.

**Pembagian tugas:** tombol **Hapus** dan **Buat proyek** diklik oleh Anda (Claude tidak diizinkan menghapus data atau menyimpan kunci rahasia di layanan online). Semua pekerjaan teknis lainnya — skema database, pemulihan data, kode, pengecekan log — dikerjakan Claude.

---

## Tahap 0 — Cadangan ✅ (sudah selesai, 2026-10-08)

Folder `_cadangan/simpel-2026-10-08/` (tidak ikut ke GitHub) berisi:

| Isi | Jumlah |
|---|---|
| Seluruh tabel database SIMPEL (JSON) | 48 tabel, 1.781 baris — termasuk **998 data pegawai** hasil impor |
| Berkas Supabase Storage (template dokumen .docx) | 17 berkas |
| Info peran `simpel_app`, daftar migrasi, sidik jari struktur | untuk pembanding setelah dibangun ulang |

Pemulihan sudah diuji pada database lokal: 47 tabel, 1.781 baris cocok semua; pemicu, penjaga audit, dan nomor urut berjalan seperti semula.

> **Jangan hapus folder `_cadangan`** sampai SIMPEL baru terbukti berjalan. Isinya data pribadi pegawai — jangan dikirim ke mana pun.

---

## Tahap 1 — Hapus (oleh Anda)

Kerjakan berurutan. Centang bila selesai.

### GitHub (akun mfp-max)
- [ ] `CareerPath-AI` → Settings → paling bawah **Delete this repository**
- [ ] `finance-dashboard` → idem
- [ ] **Biarkan** `simpel-disiplin` dan `simpega` (aplikasi UM)

### Vercel (https://vercel.com)
- [ ] Proyek `careerpath-ai` → Settings → Advanced → **Delete Project**
- [ ] Proyek `simpel-um` → idem *(alamat simpel-um.vercel.app akan dipakai lagi di Tahap 3)*

### Supabase (https://supabase.com/dashboard)
- [ ] Organisasi **Trial Project** → proyek **Career Path AI** → Project Settings → General → **Delete project**
- [ ] Organisasi **Trial Project** → Organization Settings → **Delete organization**
- [ ] Organisasi **sdmum** → proyek **Trial Project** (database SIMPEL lama) → **Delete project**
- [ ] Organisasi **sdmum** → **Delete organization** *(atau ganti namanya di Tahap 2)*

### Clerk (https://dashboard.clerk.com)
- [ ] Hapus semua aplikasi (SIMPEL UM, dan CareerPath/FinERP bila ada): pilih aplikasi → Settings → **Delete application**

### Layanan lain
- [ ] Bila CareerPath-AI / FinERP memakai layanan lain (mis. OpenAI, Google Cloud, Resend, domain), hapus kunci/proyeknya di sana juga. Beri tahu Claude daftarnya bila ragu.

---

## Tahap 2 — Tata ulang (konvensi untuk semua aplikasi UM)

| Layanan | Aturan |
|---|---|
| **Wilayah** | **Singapura** untuk semua: Supabase `ap-southeast-1`, Vercel `sin1` — paling dekat dengan pengguna di Indonesia. Database dan server aplikasi harus di wilayah yang sama. |
| **Nama** | `<aplikasi>-um` di semua layanan, mis. `simpel-um`. Nama yang sama di GitHub/Vercel/Supabase/Clerk memudahkan pencarian. |
| **Supabase** | Satu organisasi untuk semua aplikasi UM: **UM – Direktorat SDM**. Satu proyek per aplikasi. Paket gratis: maksimal 2 proyek aktif. |
| **Clerk** | Satu aplikasi Clerk per aplikasi UM (daftar pengguna terpisah). |
| **Vercel** | Satu proyek per aplikasi, disambungkan ke repo GitHub-nya — setiap `git push` ke `main` otomatis tayang. |
| **Kunci rahasia** | Disimpan hanya di Vercel (Environment Variables, tipe *Sensitive*) dan `.env.local` di PC. Database memakai peran khusus per aplikasi (`simpel_app`), bukan `postgres`. |

---

## Tahap 3 — Pasang ulang SIMPEL

### 3a. Supabase (oleh Anda, ±5 menit)
1. **New organization** → nama `UM – Direktorat SDM`, paket Free.
2. **New project** → nama `simpel-um`, region **Southeast Asia (Singapore)**, Database Password: klik **Generate**, simpan (tidak dipakai aplikasi, hanya untuk admin).
3. Setelah proyek siap (±2 menit): **SQL Editor** → **New query** → salin seluruh isi berkas `_cadangan/SQL-SIAP-TEMPEL-supabase-baru.sql` → **Run**. Harus muncul "Success. No rows returned".
4. Kirim ke Claude (boleh lewat chat — tidak rahasia):
   - **Project ref** (teks acak di alamat dashboard: `supabase.com/dashboard/project/<ref>`)
   - Alamat **pooler**: tombol **Connect** → *Transaction pooler* → teks host `aws-…pooler.supabase.com`
5. Salin ke berkas `.env.local` (buka di VS Code / Notepad, ganti nilai lama):
   - `SUPABASE_URL=https://<ref>.supabase.co`
   - `SUPABASE_SECRET_KEY=` ← Project Settings → API Keys → **secret** key (atau `service_role`)

### 3b. Clerk (oleh Anda, ±3 menit)
1. **Create application** → nama `SIMPEL UM`, metode masuk: **Email** dan **Google**.
2. Salin kunci dari halaman **API Keys** ke `.env.local`: `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` dan `CLERK_SECRET_KEY`.
3. Catatan: instans *Development* Clerk cukup untuk SIMPEL (≤100 pengguna). Instans *Production* baru diperlukan bila SIMPEL memakai domain sendiri (mis. `simpel.um.ac.id`).

### 3c. Database (oleh Claude)
Claude menyusun `DATABASE_URL` dan `DATABASE_URL_MIGRASI` (keduanya pooler **mode sesi, port 5432** — mode transaksi 6543 membuat kueri macet, lihat `lib/db.ts`) di `.env.local` dari project ref + host pooler + kata sandi `simpel_app` yang sudah disiapkan, mengganti `regions` di `vercel.json` menjadi `sin1`, lalu menjalankan:
```bash
npm run db:migrate
```
```bash
npm run db:pulihkan -- _cadangan/simpel-2026-10-08 --clerk-baru
```
Membuat skema, memulihkan seluruh data & 17 template, dan melepas tautan akun Clerk lama (pengguna tertaut ulang otomatis lewat email saat login pertama). Claude lalu menguji koneksi dan membandingkan struktur dengan cadangan.

### 3d. Vercel (oleh Anda, ±5 menit; Claude menyiapkan isian)
1. **Add New → Project** → impor repo `mfp-max/simpel-disiplin` → nama proyek `simpel-um`.
2. Sebelum **Deploy**, buka **Environment Variables** → tempel isi `.env.local` (tombol *paste .env* menerima seluruh isi sekaligus). **Jangan** ikutkan `DATABASE_URL_MIGRASI` dan `VERCEL_OIDC_TOKEN`. Tandai **Sensitive**.
3. **Deploy**. Setelah selesai, beri tahu Claude — Claude memeriksa log dan memastikan login berhasil.

### 3e. Selesai
- [ ] Login di https://simpel-um.vercel.app berhasil, Beranda tampil
- [ ] Hapus berkas `env.download` dan `_cadangan/SQL-SIAP-TEMPEL-supabase-baru.sql`
- [ ] Simpan folder `_cadangan/simpel-2026-10-08` di tempat aman (mis. flashdisk/Drive pribadi terenkripsi), lalu hapus dari folder proyek
