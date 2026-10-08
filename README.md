# SIMPEL — Sistem Informasi Manajemen Pelanggaran

**Universitas Negeri Malang · Direktorat Sumber Daya Manusia dan Keuangan**
Seksi Kinerja, Disiplin, dan Sistem Informasi SDM

SIMPEL mencatat seluruh dugaan pelanggaran disiplin pegawai — dari informasi mentah sampai arsip — dengan pembangkit surat yang formatnya bisa diatur sendiri, pemantauan tenggat otomatis, dan kerahasiaan yang terjaga.

---

## 1. Untuk pengguna (tanpa latar belakang teknis)

### Masuk
1. Buka alamat SIMPEL di peramban (laptop, tablet, atau ponsel).
2. Pilih **Lanjutkan dengan Google** (pakai akun Google yang emailnya sudah didaftarkan admin) atau masuk dengan email + kata sandi.
3. Saat pertama masuk, Anda diminta memasang **verifikasi dua langkah** (aplikasi autentikator di ponsel, mis. Google Authenticator). Ikuti petunjuk di layar.
4. Bila muncul "Akses belum diberikan", minta admin mendaftarkan email Anda di **Pengaturan → Pengguna**.

> Demi kerahasiaan, SIMPEL keluar otomatis setelah 30 menit tidak ada aktivitas.

### Empat jenis catatan
| Menu | Isi | Dihitung di tenggat & statistik? |
|---|---|---|
| **Registrasi Informasi** | Surat/laporan dugaan pelanggaran yang belum lengkap | Tidak |
| **Kasus Hukdis** | Kasus hukuman disiplin dengan tahapan penuh | Ya |
| **Pembinaan** | Teguran pembinaan, kode etik, konseling | Tidak |
| **Arsip Lampau** | Kasus sebelum SIMPEL ada; berkas boleh tidak lengkap | Tidak |

### Alur kasus singkat
1. Catat informasi → lengkapi terlapor & bukti → **Naikkan jadi kasus**.
2. SIMPEL memilih **peraturan yang berlaku pada tanggal peristiwa** secara otomatis, menghitung siapa yang berwenang, dan menyusun tahapan yang sesuai rezim (ASN / Pegawai Rektor) dan tingkat hukuman.
3. Ikuti tahap demi tahap. Warna tenggat: 🟢 aman · 🟡 1–3 hari kerja lagi · 🔴 lewat · ⚪ selesai.
4. Di tiap tahap ada tombol **Buat dokumen** — surat terisi otomatis dari data kasus, tinggal lengkapi isian yang kosong, unduh `.docx`, sunting sedikit di Word, cetak.
5. Saat pemeriksaan, pakai **Mode sidang** (tab Pemeriksaan) untuk mencatat tanya jawab — tersimpan otomatis tiap 5 detik — lalu **Selesai & Susun BAP**.

### Tips
- **Cari apa saja** dengan tombol cari di atas (atau `Ctrl + K`): nama, NIP, nomor registrasi, nomor surat, isi pindaian.
- **Mode privasi** (ikon mata di atas) menyamarkan nama & NIP di layar — berguna saat rapat atau presentasi.
- Tidak ada tombol hapus permanen; "arsipkan" menyembunyikan data dengan alasan dan tercatat di log audit.
- Panduan lengkap ada di menu **Bantuan** di dalam aplikasi.

### Cara menambah template surat baru
1. Buka dokumen Word contoh, ganti bagian yang berubah-ubah dengan penanda dalam kurung kurawal, mis. `{nama_terperiksa}`, `{nip_terperiksa}`, `{tanggal_surat_panjang}`, `{pasal_dilanggar}`. Daftar penanda ada di **Pengaturan → Template dokumen → Katalog placeholder**.
2. Untuk tabel berulang (anggota tim, tanya jawab), letakkan `{#anggota_tim}` di awal sel pertama baris dan `{/anggota_tim}` di akhir sel terakhir baris yang sama.
3. **Pengaturan → Template dokumen → Tambah template** → unggah berkas `.docx`.
4. SIMPEL memindai penanda dan mencocokkannya dengan katalog. Penanda yang tidak dikenal bisa dipetakan ke data lain atau dijadikan **isian manual**.
5. Isi jenis dokumen, rezim, dan tahap tempat template ditawarkan.
6. Tekan **Uji** untuk mengunduh contoh berisi data dummy. Bila sudah benar, aktifkan.
7. Mengunggah ulang template yang sama membuat **versi baru**; versi lama tetap tersimpan sehingga dokumen lama bisa dicetak ulang persis.

### Bila peraturan berubah
Buka **Pengaturan → Peraturan → Tambah peraturan baru**. Wizard enam langkah menyalin peraturan lama sebagai titik awal; Anda tinggal menyunting pasal, tingkat & jenis hukuman, ambang kehadiran, tenggat, dan kewenangan, lalu **menguji dengan kasus contoh** sebelum mengaktifkannya. **Tidak perlu programmer.** Kasus lama tidak tersentuh.

---

## 2. Hal yang perlu dikonfirmasi pemilik produk

- Teks pasal **PP 94/2021** di katalog disalin tanpa naskah resmi di tangan — semua ditandai *Perlu verifikasi*. Cocokkan dengan JDIH lalu hapus tandanya.
- Teks pasal **Pertor UM 70/2026** (Pasal 5 huruf a–r, Pasal 6 huruf a–s) **belum terisi** karena naskahnya belum diunggah. Salin dari naskah resmi melalui **Pengaturan → Peraturan → Pertor UM 70/2026 → Pasal**.
- Rujukan pasal ambang kehadiran, sebagian matriks kewenangan, dan kalender hari libur 2026 ditandai *Perlu verifikasi*. Kalender 2027 baru berisi libur bertanggal tetap.
- Daftar pertanyaan baku BAP dan isi 17 template disusun ulang karena berkas sumber (`templates-sumber/` dari PRD) belum tersedia. Ganti dengan berkas resmi UM melalui menu Template.
- Template SK Hukuman Disiplin lama mengutip "Pasal 3 huruf f, Pasal 4 huruf c, Pasal 10 ayat (1) huruf e" sambil menyebut Peraturan Rektor 70/2026 — padahal penomoran itu milik PP 94/2021. Di SIMPEL bagian itu kini **selalu** diisi otomatis lewat `{pasal_dilanggar}` dan `{nama_regulasi}` dari katalog peraturan kasus, sehingga kesalahan semacam itu tidak bisa terjadi lagi.
- Daftar konfirmasi lain (PRD §17): format penomoran surat, status PP Gaji & Tunjangan ASN, keberlakuan Kepmendiktisaintek 84/M/KEP/2025, daftar unit kerja penerima delegasi, kebijakan retensi arsip, penanda tangan tiap dokumen.
- Sebaiknya ada penetapan tertulis Direktur SDMK tentang pengendali data, masa simpan arsip, dan prosedur pemusnahan.

---

## 3. Untuk pengembang

### Teknologi
Next.js 15 (App Router) · TypeScript · Tailwind CSS 4 + shadcn/ui · PostgreSQL di Supabase (postgres.js) · Supabase Storage (bucket privat) · Clerk (Google + email, allowlist, 2FA) · docxtemplater · SheetJS & ExcelJS · Recharts · Vitest · Vercel.

### Mengembangkan di PC lain
Panduan langkah demi langkah (clone, ambil kunci dari Vercel, alur pull/push): **[documentation/PANDUAN-PC-LAIN.md](documentation/PANDUAN-PC-LAIN.md)**.

```bash
git clone https://github.com/mfp-max/simpel-disiplin.git
cd simpel-disiplin && npm install
vercel link --yes --project simpel-um
vercel env pull .env.local --environment=development --yes
npm run dev
```

### Menjalankan lokal
```bash
npm install
npm run dev          # http://localhost:3000
npm test             # uji unit (hari kerja, regresi hukum, resolver, nol konstanta)
npm run db:migrate   # menjalankan supabase/migrations/*.sql yang belum dijalankan
npm run db:seed      # data awal (idempoten) ; `npm run db:seed -- template` untuk template
```
Kredensial ada di `.env.local` (tidak masuk Git). Contoh nama variabel di `.env.example`.

### Struktur & konvensi
Lihat **`documentation/KONVENSI-KODE.md`**. Spesifikasi lengkap: `app_summary.md`.

### ⛔ PANTANGAN PERMANEN PROYEK
1. **Aturan hukum tidak boleh ditanam di kode.** Angka ambang, tenggat, nama jenis hukuman, kode peraturan, dan matriks kewenangan adalah isi tabel. `tests/tanpa-konstanta-hukum.test.ts` menggagalkan build bila `lib/hukdis/` memuatnya.
2. **Migrasi hanya boleh menambah**: `CREATE TABLE`, `ADD COLUMN ... NULL`, `CREATE INDEX`. Tidak pernah `DROP` atau mengubah tipe kolom yang sudah terisi. `scripts/migrasi.mjs` menolak migrasi yang melanggar.
3. **Riwayat tidak boleh berubah.** Kasus, pelanggaran, hukuman, dan dokumen menyimpan salinan beku; trigger basis data menolak perubahan katalog yang sudah dipakai.
4. **Tidak ada penghapusan permanen dari antarmuka biasa.**
5. **Kunci rahasia hanya di server** (Vercel env / `.env.local`). Tidak pernah di repo, tidak pernah di peramban.

Yang memang memerlukan programmer — dan itu wajar: entitas baru yang belum ada konsepnya, alur yang berbeda secara mendasar, atau integrasi sistem luar baru. Dalam kasus itu pun data lama tetap utuh karena migrasi hanya menambah.

### Infrastruktur
- **Supabase**: organisasi "UM - Direktorat SDM", proyek `simpel-um` (ref `noydkqtagdrsrzeflkyw`, Singapura `ap-southeast-1`), peran basis data khusus `simpel_app` (lihat `supabase/setup/00_peran_simpel_app.sql`). RLS aktif di semua tabel tanpa kebijakan anon — data hanya diakses lewat server. Cadangan harian bawaan Supabase.
- **Clerk**: aplikasi "SIMPEL UM" (instance development). Untuk produksi resmi dengan domain UM (mis. `simpel.um.ac.id`), buat instance production di dashboard Clerk dan pasang kredensial Google OAuth milik UM.
- **Vercel**: proyek `simpel-um` (fungsi di Singapura `sin1`, satu wilayah dengan database), terhubung ke repo GitHub ini; setiap push ke `main` men-deploy otomatis. Cron harian menghapus rekaman audio yang lewat masa retensi.
