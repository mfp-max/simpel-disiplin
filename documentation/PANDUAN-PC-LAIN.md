# Panduan Mengembangkan SIMPEL di PC Lain

Panduan ini untuk memindahkan pekerjaan pengembangan SIMPEL ke komputer lain (laptop kantor, PC rumah, dsb.), lalu bolak-balik di antara keduanya dengan aman.

**Ringkasnya:**
- **Kode** ada di GitHub → diambil dengan `git clone`, dikirim dengan `git push`.
- **Kunci rahasia** (database, Clerk, Supabase) **tidak** ada di GitHub → diambil dari Vercel dengan `vercel env pull`.
- **Aplikasi online** di https://simpel-um.vercel.app otomatis diperbarui setiap kali Anda `git push` ke cabang `main`.

| Apa | Alamat |
|---|---|
| Kode sumber (GitHub) | https://github.com/mfp-max/simpel-disiplin |
| Aplikasi online | https://simpel-um.vercel.app |
| Dashboard Vercel | https://vercel.com/dashboard → proyek **simpel-um** |
| Dashboard Supabase | https://supabase.com/dashboard → organisasi **sdmum** → proyek **Trial Project** |
| Dashboard Clerk | https://dashboard.clerk.com → aplikasi **SIMPEL UM** |

---

## Bagian A — Persiapan PC baru (sekali saja)

### 1. Pasang program yang dibutuhkan
| Program | Unduh dari | Cek sudah terpasang |
|---|---|---|
| **Git** | https://git-scm.com/downloads (Windows: pilih "Git for Windows", klik Next sampai selesai) | `git --version` |
| **Node.js 24 LTS** | https://nodejs.org → tombol **LTS** | `node --version` (harus v22 atau lebih baru) |
| **Visual Studio Code** (opsional, penyunting kode) | https://code.visualstudio.com | — |
| **Claude Code** (opsional, bila ingin dibantu Claude) | https://claude.com/claude-code | — |

Buka **Terminal** (Windows: PowerShell atau "Git Bash"; Mac: Terminal) untuk perintah-perintah di bawah.

### 2. Pasang Vercel CLI dan login
```bash
npm install -g vercel
```
```bash
vercel login
```
Pilih **Continue with GitHub** (atau email yang sama dengan akun Vercel Anda: `mfajarivanpratama-3925`). Browser akan terbuka — klik izinkan.

### 3. Ambil kode dari GitHub (clone)
Pindah ke folder tempat Anda ingin menyimpan proyek, misalnya `D:\_APPS` atau `Documents`:
```bash
cd D:\_APPS
```
```bash
git clone https://github.com/mfp-max/simpel-disiplin.git
```
```bash
cd simpel-disiplin
```
> Bila repo sudah dijadikan **privat** (dianjurkan, lihat Bagian E), Git akan meminta login GitHub — sebuah jendela login muncul; masuk dengan akun **mfp-max**.

### 4. Atur identitas Git (agar commit tercatat atas nama Anda)
```bash
git config --global user.name "mfp-max"
```
```bash
git config --global user.email "mfajarivanpratama@um.ac.id"
```

### 5. Pasang pustaka
```bash
npm install
```
Butuh 1–3 menit. Peringatan berwarna kuning boleh diabaikan.

### 6. Ambil kunci rahasia dari Vercel
Tautkan folder ke proyek Vercel:
```bash
vercel link --yes --project simpel-um
```
Tarik semua variabel lingkungan ke berkas `.env.local`:
```bash
vercel env pull .env.local --environment=development --yes
```
Berkas `.env.local` kini berisi alamat database, kunci Supabase, dan kunci Clerk. **Berkas ini otomatis diabaikan Git — jangan pernah dikirim lewat email/WhatsApp atau diunggah ke mana pun.**

### 7. Jalankan aplikasi di PC
```bash
npm run dev
```
Tunggu sampai muncul `Ready`, lalu buka **http://localhost:3000** di browser dan login seperti biasa (Google / email yang terdaftar). Hentikan dengan `Ctrl + C`.

### 8. Pastikan semuanya beres
```bash
npm test
```
Hasil yang benar: `62 passed` (jumlah bisa bertambah seiring fitur baru).

---

## Bagian B — Alur kerja harian (di PC mana pun)

**Prinsip emas: selalu `pull` sebelum mulai, selalu `push` setelah selesai.** Dengan begitu kedua PC tidak pernah berselisih.

### Sebelum mulai bekerja — ambil perubahan terbaru
```bash
git pull
```
Bila `package.json` berubah sejak terakhir kali (misalnya ada pustaka baru), jalankan juga:
```bash
npm install
```

### Setelah selesai — simpan dan kirim
Lihat apa saja yang berubah:
```bash
git status
```
Simpan semua perubahan sebagai satu "commit" dengan keterangan singkat:
```bash
git add -A
```
```bash
git commit -m "Perbaiki tampilan daftar kasus di ponsel"
```
Kirim ke GitHub:
```bash
git push
```
Sekitar 3 menit kemudian https://simpel-um.vercel.app sudah memakai versi baru. Pantau di dashboard Vercel → proyek **simpel-um** → **Deployments** (status **Ready** = berhasil; **Error** = ada yang gagal, klik untuk melihat sebabnya — versi lama tetap berjalan).

### Ingin mencoba sesuatu tanpa mengganggu versi online? Pakai cabang (branch)
```bash
git checkout -b coba-fitur-baru
```
Kerjakan, commit, lalu:
```bash
git push -u origin coba-fitur-baru
```
Vercel membuat **alamat pratinjau** khusus (terlihat di dashboard Vercel → Deployments) — versi online di `simpel-um.vercel.app` tidak tersentuh. Bila sudah yakin, gabungkan ke `main`:
```bash
git checkout main
```
```bash
git merge coba-fitur-baru
```
```bash
git push
```

---

## Bagian C — Hal yang WAJIB diketahui

1. **Hanya ada SATU database** (proyek Supabase "Trial Project"). Aplikasi di PC Anda (`localhost:3000`) dan aplikasi online memakai database yang sama. Data yang Anda buat/ubah/arsipkan saat mencoba di PC **langsung tampil di versi online**. Untuk percobaan, buat data yang jelas berlabel "UJI" lalu arsipkan setelah selesai.
2. **Perubahan struktur database** dilakukan dengan menambah berkas baru di `supabase/migrations/` (mis. `0009_tambah_kolom_x.sql`) lalu menjalankan:
   ```bash
   npm run db:migrate
   ```
   Perintah ini langsung mengubah database produksi. Ikuti pantangan di `README.md`: **migrasi hanya boleh menambah**, tidak pernah menghapus.
3. **Kunci rahasia hanya di `.env.local` dan di Vercel.** Bila suatu saat ada kunci yang diganti (misalnya kata sandi database), perbarui di Vercel (dashboard → simpel-um → Settings → Environment Variables), lalu di setiap PC jalankan ulang `vercel env pull .env.local --environment=development --yes`.
4. **Jangan mengedit di dua PC bersamaan** tanpa `push`/`pull`. Bila sampai terjadi bentrok (`git pull` memunculkan kata *CONFLICT*), jangan panik — buka berkas yang disebut, pilih bagian yang benar (VS Code menampilkan tombol "Accept Current / Accept Incoming"), lalu `git add -A`, `git commit`, `git push`. Atau minta bantuan Claude Code: "selesaikan konflik git ini".
5. **Mode development Clerk** mengizinkan login dari `localhost`, jadi login di PC berjalan normal. Daftar email yang boleh masuk tetap diatur dari **Pengaturan → Pengguna** di aplikasi.

---

## Bagian D — Memakai Claude Code di PC lain

1. Buka folder `simpel-disiplin` di terminal, ketik `claude`.
2. Claude akan membaca `CLAUDE.md`, `README.md`, dan **`documentation/KONVENSI-KODE.md`** (aturan arsitektur & pantangan) — jadi konteks proyek tetap terjaga.
3. Catatan "memori" Claude disimpan per komputer dan **tidak ikut pindah**. Bila perlu, beri tahu di awal: *"Baca README dan documentation/KONVENSI-KODE.md dulu."*
4. Untuk Clerk CLI dan Supabase CLI (opsional, hanya bila mengubah pengaturan Clerk atau menjalankan SQL langsung): `npm install -g clerk` lalu `clerk login`; Supabase cukup `npx supabase login`.

---

## Bagian E — Dianjurkan: jadikan repo GitHub privat

Saat ini repo `mfp-max/simpel-disiplin` **publik** — siapa pun bisa melihat kodenya. Tidak ada kunci rahasia di dalamnya, tetapi karena SIMPEL menangani data disiplin yang bersifat rahasia, sebaiknya kodenya juga tertutup:

1. Buka https://github.com/mfp-max/simpel-disiplin → **Settings** (ikon gerigi, tab paling kanan).
2. Gulir ke bawah sampai **Danger Zone** → **Change repository visibility** → **Change to private** → konfirmasi.
3. Vercel tetap bisa men-deploy repo privat (sudah terhubung). Bila deploy berikutnya gagal karena izin, buka dashboard Vercel → simpel-um → **Settings → Git** → sambungkan ulang.

---

## Bagian F — Masalah umum

| Gejala | Penyebab & solusi |
|---|---|
| `git` / `node` / `vercel` "is not recognized" | Program belum terpasang atau terminal belum dibuka ulang setelah memasang. Tutup lalu buka lagi terminal. |
| `vercel env pull` gagal "not linked" | Jalankan dulu `vercel link --yes --project simpel-um`. |
| Halaman `localhost:3000` galat "DATABASE_URL belum diatur" | Berkas `.env.local` belum ada / kosong — ulangi Bagian A langkah 6. |
| Login berhasil tapi muncul "Akses belum diberikan" | Email belum terdaftar/aktif di **Pengaturan → Pengguna**. |
| `git push` ditolak "rejected … fetch first" | PC lain sudah push lebih dulu. Jalankan `git pull`, lalu `git push` lagi. |
| `npm install` memperingatkan "install scripts not yet covered" | Normal; izin skrip yang diperlukan sudah tercatat di `package.json` (`allowScripts`). |
| Deploy Vercel **Error** | Klik deployment-nya di dashboard → baca log. Coba `npm run build` di PC untuk melihat galat yang sama secara lokal. Versi online sebelumnya tetap berjalan. |
| Ingin membatalkan perubahan yang belum di-commit | `git restore .` (hati-hati: semua perubahan yang belum di-commit hilang). |
