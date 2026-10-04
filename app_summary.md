# PRD — SIMPEL (Sistem Informasi Manajemen Pelanggaran)

**Pemilik produk:** Kepala Seksi Kinerja, Disiplin, dan Sistem Informasi SDM
Subdirektorat Sumber Daya Manusia — Direktorat Sumber Daya Manusia dan Keuangan
Universitas Negeri Malang (PTN-BH)

**Versi dokumen:** 1.1 · **Tanggal:** 4 Oktober 2026
**Status:** siap dieksekusi oleh Claude Code

> **Perubahan v1.1:** menambahkan §18 — arsitektur tahan perubahan aturan. Seluruh kaidah hukum di §4 diturunkan statusnya menjadi **data awal (seed)**, bukan ketentuan yang ditanam di kode. Baca §18 **sebelum** menulis baris kode apa pun di §4 dan §6.

---

## CARA MEMAKAI DOKUMEN INI (baca dulu, Claude Code)

Dokumen ini adalah spesifikasi lengkap sekaligus perintah kerja. Pemilik produk **bukan programmer**. Karena itu:

1. **Jangan hanya membuat kode.** Kerjakan sampai aplikasi hidup di internet dan bisa dipakai: repo GitHub terbuat, database Supabase termigrasi dan terisi data awal, autentikasi Clerk aktif, dan aplikasi ter-deploy di Vercel dengan URL yang bisa dibuka.
2. **Kerjakan bertahap dan laporkan.** Setiap kali menyelesaikan satu tahap (lihat §15), tunjukkan apa yang sudah jadi dan apa yang Anda butuhkan dari pengguna.
3. **Saat butuh kredensial, minta dengan jelas dan beri instruksi klik.** Contoh: "Buka dashboard.clerk.com → Create application → pilih Google → salin `CLERK_PUBLISHABLE_KEY` dan `CLERK_SECRET_KEY` lalu tempel di sini." Jangan menebak nilai kunci, jangan menaruh kunci asli di repo.
4. **Jangan memakai data asli pegawai selama pengembangan.** Gunakan berkas dummy `simpega.um.ac.id-laporan-rekap.xlsx` (1.000 baris, sudah dummy) untuk seeding dan pengujian.
5. **Bahasa antarmuka: Bahasa Indonesia** seluruhnya. Istilah hukum ditulis persis seperti di peraturan (contoh: "hukuman disiplin", bukan "sanksi"; "Berita Acara Pemeriksaan", bukan "notulen").
6. **Jika ada pertentangan antara dokumen ini dan peraturan yang dikutip, peraturan yang menang.** Catat pertentangannya dan tanyakan.
7. **Aturan hukum tidak boleh ditanam di kode.** Semua angka, daftar, ambang, tenggat, dan matriks kewenangan di §4 adalah **isi tabel**, bukan konstanta program. Jika Anda mendapati diri menulis `if (regulasi === 'PP_94_2021')` atau menaruh angka `28` di dalam fungsi, berhenti dan baca ulang §18. Ini syarat mutlak, bukan saran.

---

## 1. Latar belakang dan masalah

Seksi Kinerja, Disiplin, dan Sistem Informasi SDM UM menangani penegakan disiplin untuk **dua rezim hukum yang berbeda** sekaligus, dengan alur, tenggat, dan jenis hukuman yang tidak sama. Hari ini seluruh prosesnya dikerjakan manual dengan berkas Word yang disalin-tempel, sehingga:

- **Arsip kasus lampau tercecer.** Sebagian kasus tahun 1990-an hanya tersisa satu lembar kronologi. Data itu tetap data dan tetap harus terwadahi, tetapi tidak bisa dipaksa mengikuti alur proses modern.
- **Format surat dari kementerian berubah-ubah**, sehingga template yang di-hardcode akan cepat usang.
- **Tenggat prosedural mudah terlewat** (panggilan 7 hari kerja, penyampaian 14 hari kerja, berlaku hari kerja ke-15, masa hukuman 12 bulan) dan tidak ada yang memantau.
- **Kesalahan rujukan pasal sering terjadi.** Contoh nyata dari template yang ada sekarang: SK Penjatuhan Hukuman Disiplin mengutip "Pasal 3 huruf f, Pasal 4 huruf c, Pasal 10 ayat (1) huruf e" tetapi menyebut **Peraturan Rektor Nomor 70 Tahun 2026** — padahal penomoran itu milik PP 94/2021; di Pertor 70/2026 kewajiban ada di **Pasal 5** dan larangan di **Pasal 6**. SIMPEL harus mencegah kesalahan semacam ini secara struktural.
- **Tidak ada monitoring dan evaluasi.** Tidak ada yang bisa menjawab "berapa kasus berjalan, di tahap apa, macet di mana".

**SIMPEL** menyelesaikan itu: satu kanal pencatatan pelanggaran dari informasi mentah sampai arsip, dengan pembangkit dokumen yang formatnya bisa diatur sendiri, pemantauan tenggat otomatis, dan kerahasiaan yang dijaga.

---

## 2. Tujuan produk

| # | Tujuan | Ukuran keberhasilan |
|---|---|---|
| T1 | Semua pelanggaran — lama maupun baru — tercatat di satu tempat | 100% berkas fisik yang ada sudah terdaftar dalam 6 bulan |
| T2 | Dokumen prosedural dibuat sistem, bukan salin-tempel | ≥90% surat/SK dihasilkan dari SIMPEL, waktu susun BAP turun dari jam ke menit |
| T3 | Tidak ada tenggat prosedural yang terlewat | 0 kasus lewat tenggat tanpa peringatan sistem |
| T4 | Rujukan pasal selalu benar sesuai rezim dan tahun kejadian | 0 SK dengan salah rujuk pasal |
| T5 | Pimpinan bisa melihat posisi semua kasus kapan saja | Dashboard monev terpakai mingguan |
| T6 | Kerahasiaan terjaga | Seluruh akses terekam di audit log; tidak ada akses dari luar daftar email yang diizinkan |

**Bukan tujuan (v1):** integrasi presensi otomatis, tanda tangan elektronik tersertifikasi (TTE BSrE), portal bagi pegawai terperiksa, transkripsi audio otomatis, aplikasi mobile native.

---

## 3. Pengguna dan hak akses

Hanya **5 orang**, semuanya di Direktorat SDMK UM. Tidak ada pendaftaran mandiri — akses diberikan dengan memasukkan alamat email ke daftar izin (allowlist).

| Peran | Jumlah | Hak |
|---|---|---|
| `direktur` | 1 | Lihat semua; ubah status kasus; tidak menghapus; akses penuh dashboard monev |
| `kasubdit` | 1 | Lihat semua; ubah semua kasus; tidak menghapus |
| `kasi` | 3 | Lihat semua; buat dan ubah kasus; unggah berkas; buat dokumen |
| `admin` | 1 (dirangkap pemilik produk) | Semua di atas + kelola pengguna, template, master data, dan penghapusan |

**Model visibilitas: semua pengguna melihat semua kasus.** Pembedaan hanya pada hak ubah dan hapus. Ini keputusan sadar pemilik produk — tim kecil dan saling menggantikan. Konsekuensinya, **audit log wajib** dan harus mencatat juga peristiwa *membaca* kasus, bukan hanya mengubah.

Implementasi:
- Tabel `app_users` berisi `email`, `nama`, `jabatan`, `role`, `aktif`, `clerk_user_id`.
- Clerk dikonfigurasi **restricted sign-up**: hanya email di allowlist yang bisa masuk; login lewat Google OAuth maupun email+sandi.
- Baris di `app_users` dibuat lebih dulu oleh admin; saat seseorang login pertama kali, `clerk_user_id` ditautkan otomatis. Jika email tidak ada di `app_users` atau `aktif=false`, tampilkan halaman "Akses belum diberikan" dan hentikan.
- Supabase Row Level Security aktif di **semua** tabel. Akses data hanya lewat server (Next.js Route Handler / Server Action) memakai service role setelah peran diverifikasi; **jangan** pernah mengekspos service key ke browser.

---

## 4. Dasar hukum dan kaidah domain

Ini bagian paling penting. Salah di sini membuat aplikasi menghasilkan dokumen cacat hukum.

### 4.1 Dua rezim yang berlaku sekarang

**Rezim A — ASN (PNS/CPNS)**
- PP Nomor 94 Tahun 2021 tentang Disiplin PNS
- Peraturan BKN Nomor 6 Tahun 2022 (peraturan pelaksanaan PP 94/2021)
- Kepmendiktisaintek Nomor 84/M/KEP/2025 (13 Maret 2025) — mendelegasikan kepada **Rektor** kewenangan melakukan pemeriksaan dan membentuk Tim Pemeriksa untuk ancaman hukuman **sedang dan berat**; disampaikan lewat Surat Sekjen Nomor 991/A/KP.04.04/2025
- PP Nomor 10 Tahun 1983 jo. PP Nomor 45 Tahun 1990 tentang Izin Perkawinan dan Perceraian PNS — **masih berlaku**; pelanggarannya diancam salah satu hukuman disiplin berat (PP 94/2021 Pasal 41)

**Rezim B — Pegawai yang diangkat Rektor (dosen tetap & tendik tetap non-ASN, termasuk Calon Pegawai)**
- Peraturan Rektor UM Nomor 70 Tahun 2026 tentang Disiplin Pegawai yang Diangkat oleh Rektor (ditetapkan 22 Juni 2026)

Pemetaan otomatis dari kolom `Status Pegawai` di Simpega: `PNS` → Rezim A; `PTNA` dan status non-ASN lain → Rezim B; `Akademisi Luar UM` dan sejenisnya → tandai `perlu_verifikasi_manual`.

### 4.2 Aturan untuk arsip kasus lampau (tempus delicti)

Kasus dinilai dengan aturan yang berlaku **saat perbuatan terjadi**, bukan aturan hari ini. Karena itu setiap kasus menyimpan `regulasi_id` sendiri, dan daftar peraturan harus bisa ditambah. Isi awal tabel `regulasi`:

| Kode | Nama | Rezim | Berlaku dari | Berlaku s.d. | Catatan |
|---|---|---|---|---|---|
| `PP_30_1980` | PP 30/1980 Peraturan Disiplin PNS | A | 1980-08-30 | 2010-06-06 | Untuk arsip lama; 8 jenis hukuman |
| `PP_53_2010` | PP 53/2010 Disiplin PNS | A | 2010-06-06 | 2021-08-31 | Dicabut PP 94/2021 kecuali jenis HD sedang pada masa transisi |
| `PP_94_2021` | PP 94/2021 Disiplin PNS | A | 2021-08-31 | — | Berlaku |
| `PERBKN_6_2022` | PerBKN 6/2022 | A | 2022-03-2x | — | Juknis PP 94/2021 |
| `KEPMEN_84_2025` | Kepmendiktisaintek 84/M/KEP/2025 | A | 2025-03-13 | — | Delegasi pembentukan Tim Pemeriksa ke Rektor |
| `PP_10_1983` | PP 10/1983 jo. PP 45/1990 | A | 1983-04-21 | — | Izin perkawinan/perceraian; sanksi HD berat |
| `PERKA_BKN_25_2015` | Perka BKN 25/2015 Ijazah Palsu | A | 2015-07-02 | — | **Peringatan:** disusun di atas PP 53/2010 & UU 5/2014 yang sudah diganti. Bagian *tindakan administratif* masih dipakai; pemetaan hukuman disiplin harus mengikuti PP 94/2021 |
| `PERTOR_70_2026` | Pertor UM 70/2026 | B | 2026-06-22 | — | Berlaku |

Saat pengguna memilih peraturan, sistem **hanya** menawarkan pasal, kewajiban, larangan, dan jenis hukuman milik peraturan itu. Tidak boleh ada pasal lintas-peraturan dalam satu kasus. Ini yang mencegah kesalahan pada §1.

Untuk peraturan arsip lama (`PP_30_1980`, `PP_53_2010`), cukup sediakan daftar jenis hukuman dan kolom teks bebas untuk pasal — tidak perlu katalog pasal lengkap.

### 4.3 Tingkat dan jenis hukuman

> **Status isi di bawah: DATA AWAL, bukan spesifikasi program.** Jumlah tingkat, jumlah jenis, nama jenis, dan durasinya **berbeda di setiap generasi peraturan** — lihat tabel pembuktian di §18.1. Tabel `jenis_hukuman` harus bisa menampung peraturan yang punya 4 tingkat atau 11 jenis tanpa perubahan skema. Jangan pernah mengasumsikan "ringan/sedang/berat" dan "3/3/3".

Nilai seed untuk dua rezim aktif:

**PP 94/2021 (Pasal 8)**

| Tingkat | Jenis | Catatan |
|---|---|---|
| ringan | teguran lisan | |
| ringan | teguran tertulis | |
| ringan | pernyataan tidak puas secara tertulis | |
| sedang | pemotongan tunjangan kinerja 25% selama 6 bulan | **Belum berlaku** sampai PP tentang Gaji dan Tunjangan terbit (PP 94 Pasal 42; PerBKN 6/2022 Pasal 62). Sementara: penundaan kenaikan gaji berkala 1 tahun |
| sedang | pemotongan tunjangan kinerja 25% selama 9 bulan | Sementara: penundaan kenaikan pangkat 1 tahun |
| sedang | pemotongan tunjangan kinerja 25% selama 12 bulan | Sementara: penurunan pangkat setingkat lebih rendah 1 tahun |
| berat | penurunan jabatan setingkat lebih rendah selama 12 bulan | |
| berat | pembebasan dari jabatan menjadi jabatan pelaksana selama 12 bulan | |
| berat | pemberhentian dengan hormat tidak atas permintaan sendiri sebagai PNS | |

Beri kolom `aktif` dan `pengganti_sementara_id` pada tabel ini supaya status transisi tunjangan kinerja bisa diubah admin tanpa ubah kode. Di layar pemilihan, tampilkan catatan transisi itu sebagai peringatan.

**Pertor 70/2026 (Pasal 8)**

| Tingkat | Jenis |
|---|---|
| ringan | teguran lisan / teguran tertulis / pernyataan tidak puas secara tertulis |
| sedang | penundaan kenaikan gaji berkala 12 bulan / penundaan kenaikan pangkat 12 bulan / penurunan pangkat setingkat lebih rendah 12 bulan |
| berat | penurunan jabatan Fungsional atau Pelaksana setingkat lebih rendah 12 bulan / pembebasan dari jabatan Fungsional menjadi jabatan Pelaksana 12 bulan / pemberhentian dengan hormat tidak atas permintaan sendiri sebagai Pegawai UM |

Tambahan Pertor 70/2026 Pasal 8 ayat (5): hukuman **sedang dan berat** otomatis disertai **pemotongan insentif kinerja** sesuai Peraturan Rektor tentang Insentif Kinerja. Sistem menandai ini otomatis (`pemotongan_ik = true`) dan memunculkannya di SK serta dashboard.

### 4.4 Ambang pelanggaran kehadiran

> **Status isi di bawah: DATA AWAL.** Ambang ini **pernah berubah drastis** — di PP 53/2010 hukuman ringan dimulai pada 5 hari dan hukuman berat baru pada 31 hari; di PP 94/2021 ringan dimulai pada 3 hari dan berat sudah pada 21 hari. Lihat §18.1. Karena itu ambang **wajib** disimpan di tabel `ambang_kehadiran` yang terikat `regulasi_id`, bukan ditulis di kode.

Berlaku identik di PP 94/2021 dan Pertor 70/2026. Hitung kumulatif per tahun berjalan, Januari–Desember. Sistem menyediakan kalkulator: masukkan jumlah hari tidak masuk kerja tanpa alasan yang sah, sistem mengusulkan tingkat dan jenis hukuman berdasarkan baris tabel yang berlaku pada tanggal peristiwa.

| Hari kerja TMK tanpa alasan sah | Tingkat | Jenis |
|---|---|---|
| 3 | ringan | teguran lisan |
| 4–6 | ringan | teguran tertulis |
| 7–10 | ringan | pernyataan tidak puas secara tertulis |
| 11–13 | sedang | jenis sedang ke-1 |
| 14–16 | sedang | jenis sedang ke-2 |
| 17–20 | sedang | jenis sedang ke-3 |
| 21–24 | berat | penurunan jabatan setingkat lebih rendah 12 bulan |
| 25–27 | berat | pembebasan dari jabatan menjadi jabatan pelaksana 12 bulan |
| ≥28 | berat | pemberhentian dengan hormat tidak atas permintaan sendiri |
| 10 hari **berturut-turut** | berat | pemberhentian + **penghentian pembayaran gaji sejak bulan berikutnya, tanpa menunggu SK hukuman disiplin** |

Kasus 10 hari berturut-turut memicu alur terpisah: atasan langsung memberi tahu unit kepegawaian → unit kepegawaian melakukan verifikasi dan validasi → hasilnya ke Kuasa Pengguna Anggaran → KPA menetapkan keputusan penghentian gaji. Sediakan checklist tahap ini.

### 4.5 Kewenangan pemeriksaan dan penjatuhan

Sistem harus **menghitung dan menampilkan** siapa yang berwenang, lalu memakainya untuk mengisi dokumen. Jangan biarkan pengguna menebak.

**Rezim A (ASN):**
- Pemeriksaan hukuman **ringan**: oleh **atasan langsung** (PP 94 Pasal 27). **Jangan** bentuk Tim Pemeriksa untuk kasus ringan.
- Pemeriksaan hukuman **sedang**: Tim Pemeriksa boleh dibentuk. **Berat**: Tim Pemeriksa wajib.
- Pembentukan Tim Pemeriksa sedang/berat: **oleh Rektor**, berdasarkan delegasi Kepmen 84/M/KEP/2025. Salinan SK wajib dikirim ke Sekretaris Jenderal melalui Biro Organisasi dan SDM → sistem membuat tugas "kirim salinan SK Tim Pemeriksa ke Sekjen" otomatis begitu SK terbit.
- Komposisi tim: atasan langsung + unsur pengawasan (boleh SPI UM) + unsur kepegawaian; ketua merangkap anggota, sekretaris merangkap anggota, sekurangnya 1 anggota; **jabatan anggota tidak boleh lebih rendah** dari pegawai yang diperiksa. Sistem memvalidasi ini dan menolak simpan jika dilanggar, dengan pesan yang jelas.
- Jika atasan langsung diduga terlibat, anggota tim diisi atasan yang lebih tinggi berjenjang (PerBKN Pasal 29 ayat 6).
- **Penjatuhan hukuman tidak didelegasikan.** Rektor (setara Pejabat Pimpinan Tinggi Madya, PerBKN Pasal 32 huruf a) hanya berwenang menjatuhkan hukuman **ringan bagi pegawai 1 tingkat di bawahnya** dan **sedang bagi 2 tingkat di bawahnya**. Hukuman **berat bagi Pejabat Administrator ke bawah dan pejabat fungsional tetap kewenangan Menteri** (PerBKN Pasal 15 huruf c). Untuk kasus itu sistem membuka tahap "Usul ke Menteri" dan merangkai berkas usul.

**Rezim B (Pegawai Rektor), Pertor 70/2026:**
- **Ringan**: Tim Pemeriksa unit kerja, dibentuk pimpinan unit kerja. Penjatuhan oleh pimpinan unit kerja — tetapi hanya 6 jabatan yang menerima delegasi (Pasal 14 ayat 3): Wakil Rektor (Direktorat & UPT), Sekretaris Universitas, Dekan/Direktur Sekolah Pascasarjana, Ketua LPPM/LPPP, Kepala BPI/BPM/Direktur BPUDA. Jika unit kerja pegawai tidak masuk daftar, sistem memberi peringatan: "pimpinan unit kerja ini belum menerima delegasi; kewenangan naik ke Rektor".
- **Sedang & berat**: Tim Pemeriksa UM, dibentuk Rektor; penjatuhan oleh Rektor.
- Semua tingkat bagi Wakil Rektor dan pimpinan unit kerja: oleh Rektor.

### 4.6 Tenggat prosedural (sama di kedua rezim kecuali disebutkan)

Semua dalam **hari kerja**. Sistem wajib punya kalender hari libur nasional dan cuti bersama yang bisa diisi admin per tahun — tanpa itu perhitungan salah.

| Peristiwa | Tenggat | Rujukan |
|---|---|---|
| Surat Panggilan I → tanggal pemeriksaan | paling lambat 7 hari kerja sebelum pemeriksaan | PP 94 Psl 26(2); Pertor Psl 16(3) |
| Tidak hadir → Surat Panggilan II | paling lambat 7 hari kerja sejak tanggal seharusnya diperiksa | PP 94 Psl 26(3); Pertor Psl 16(4) |
| Tidak hadir pada panggilan II | hukuman dijatuhkan atas bukti yang ada, tanpa pemeriksaan | PP 94 Psl 26(4); Pertor Psl 16(5) |
| SK ditetapkan → disampaikan | paling lambat 14 hari kerja | PP 94 Psl 37(3); Pertor Psl 28(5) |
| Tidak hadir saat penyampaian → dikirim | paling lambat 3 hari kerja setelahnya | PerBKN Psl 49(8); Pertor Psl 28(7) |
| SK diterima → mulai berlaku | hari kerja ke-15 | PerBKN Psl 50(1); Pertor Psl 29(1) |
| Masa menjalani hukuman sedang/berat tertentu | 12 bulan | — |
| Selama menjalani HD sedang/berat | KGB dan kenaikan pangkat diblokir | PerBKN Psl 55(1); Pertor Psl 34(1) |

Kaidah tambahan yang harus ditegakkan sistem:
- Satu pegawai dengan beberapa pelanggaran dalam satu pemeriksaan → **hanya satu** jenis hukuman, yang terberat.
- Pernah dihukum lalu mengulang pelanggaran sejenis → hukuman lebih berat. **Kecuali** pelanggaran kehadiran (PerBKN Pasal 46 ayat 7).
- Pegawai yang sedang diperiksa atau sedang mengajukan upaya administratif **tidak boleh disetujui pindah unit kerja** → tampilkan penanda mencolok di profil pegawai.
- Dugaan pidana: proses disiplin jalan terus; kecuali yang berakibat pemberhentian tidak dengan hormat, menunggu putusan berkekuatan hukum tetap.

---

## 5. Ruang lingkup dan daur hidup kasus

SIMPEL mencatat **empat kelas entri**, dengan kedalaman proses berbeda:

### 5.1 `informasi` — belum jadi perkara
Surat masuk, laporan lisan, disposisi, temuan — apa pun yang menyebut dugaan pelanggaran tetapi **belum punya pelapor jelas, bukti, atau alat lain**. Wajib dicatat supaya tidak hilang.

**Penting: entri berstatus `informasi` TIDAK dihitung dalam counter progress, SLA, maupun statistik penanganan.** Dia muncul di kotak masuk tersendiri ("Registrasi Informasi") dengan nomor registrasi sendiri, dan baru masuk hitungan setelah dinaikkan menjadi kasus. Dashboard monev menampilkannya terpisah sebagai "Informasi belum berproses (n)".

Tombol **"Naikkan jadi kasus"** aktif hanya jika minimal terisi: pegawai terlapor teridentifikasi, dan ada sekurangnya satu dari (pelapor bernama / dokumen bukti terunggah / rekap kehadiran terlampir).

### 5.2 `non_hukdis` — pembinaan, bukan hukuman disiplin
Teguran pembinaan, pelanggaran kode etik, konseling, peringatan lisan atasan. Dicatat ringkas, punya berkas, tidak menjalani tahapan pemeriksaan formal, tidak menghasilkan SK hukuman disiplin. Bisa dirujuk silang sebagai riwayat saat kelak ada kasus hukdis.

### 5.3 `arsip` — kasus lampau
Kasus yang sudah selesai sebelum SIMPEL ada, sering dengan berkas tidak lengkap. **Semua kolom opsional kecuali:** nama pegawai (boleh teks bebas jika pegawai tidak ada di master), tahun kejadian, dan satu baris uraian. Tahapan tidak wajib. Status langsung `selesai`.

Fitur yang wajib ada di sini:
- Unggah pindaian berkas apa adanya (satu lembar kronologi pun diterima), dengan OCR opsional untuk pencarian teks.
- Penanda `kelengkapan_berkas`: `lengkap` / `sebagian` / `minim`.
- Kolom `regulasi_id` boleh diisi `PP_30_1980` atau `PP_53_2010`.
- Tidak menghitung SLA, tidak memunculkan peringatan tenggat.

### 5.4 `hukdis` — kasus aktif, mengikuti tahapan penuh

Status kasus (enum `status_kasus`):

```
informasi → telaah → pemeriksaan → penjatuhan → penyampaian → berlaku →
menjalani → selesai
                 ↘ upaya_administratif ↗
                 ↘ dihentikan (tidak terbukti / kedaluwarsa / pegawai berhenti)
```

Tahapan (tabel `tahapan_kasus`), masing-masing punya tanggal rencana, tanggal realisasi, penanggung jawab, dokumen terkait, dan catatan. Tahapan yang muncul **berbeda menurut rezim dan tingkat hukuman** — jangan tampilkan tahapan yang tidak relevan.

**Rezim A, hukuman ringan:** Telaah → Panggilan I → (Panggilan II) → Pemeriksaan oleh atasan langsung → BAP → Laporan hasil pemeriksaan → Penetapan SK → Penyampaian SK → Berlaku hari ke-15 → Selesai

**Rezim A, hukuman sedang/berat:** Telaah → Pembentukan Tim Pemeriksa oleh Rektor → Lapor salinan SK ke Sekjen → (Surat Tugas Tim Sekretariat) → Panggilan I → (Panggilan II) → Pemeriksaan → BAP → LHP + rekomendasi → Nota Dinas Laporan Kewenangan → [jika berat & kewenangan Menteri: Usul ke Menteri] → Penetapan SK → Penyampaian SK → Berlaku hari ke-15 → Menjalani hukuman 12 bulan → Selesai

**Rezim B, hukuman ringan:** Telaah → Pembentukan Tim Pemeriksa unit kerja → Panggilan I → (Panggilan II) → Pemeriksaan → BAP → Laporan hasil pemeriksaan ke pimpinan unit kerja → Penetapan SK oleh pimpinan unit kerja → Penyampaian → Berlaku hari ke-15 → Selesai

**Rezim B, hukuman sedang/berat:** Telaah → Pembentukan Tim Pemeriksa UM oleh Rektor → Panggilan I → (Panggilan II) → Pemeriksaan → BAP → LHP ke Rektor → Penetapan SK oleh Rektor → Penyampaian → Berlaku hari ke-15 → Menjalani 12 bulan + pemotongan insentif kinerja → Selesai

Cabang tambahan yang harus didukung:
- **Pembebasan sementara dari tugas jabatan** (dugaan hukuman berat) — menghasilkan SK tersendiri; pegawai tetap masuk kerja dan tetap menerima hak kepegawaian.
- **Upaya administratif** — keberatan dan banding administratif, dengan tanggal pengajuan, kepada siapa, dan hasilnya. Catatan: Pertor 70/2026 tidak mengatur tenggat untuk ini, jadi tenggat di sistem bersifat *pengingat internal*, bukan tenggat hukum. Beri label jelas.
- **Penghentian pembayaran gaji** (10 hari berturut-turut).

---

## 6. Model data

Postgres di Supabase. Semua tabel: `id uuid primary key default gen_random_uuid()`, `created_at`, `updated_at`, `created_by`, `updated_by`. RLS aktif di semua tabel.

> **Koreksi penting terhadap v1.0:** di bawah ini beberapa kolom ditulis sebagai `enum`. **Jangan memakai tipe ENUM Postgres** untuk nilai yang bisa bertambah seiring terbitnya aturan baru — ENUM sulit diubah dan memaksa migrasi setiap kali. Pakai **tabel lookup** + foreign key, atau `text` + constraint yang dibaca dari tabel. Hanya nilai yang betul-betul tidak akan pernah bertambah (misal `jenis_kelamin`) boleh jadi ENUM. Tabel tambahan yang wajib ada ada di §18.2.

### 6.1 Master

**`pegawai`** — hasil impor Simpega. **Hanya kolom di bawah yang boleh disimpan.** Lihat §8 untuk kolom yang dilarang diimpor.
```
nip (text, unique, nullable)   nip_lama           nama_lengkap_gelar
nama_tanpa_gelar               jenis_kelamin      tempat_lahir  tanggal_lahir
email_resmi                    status_pegawai     jenis_pegawai  kelompok_jabatan
golongan_pangkat               tmt_golongan       jabatan_fungsional  tmt_jabatan_fungsional
jabatan_tambahan               unit_kerja         subag_unit_kerja
unit_kerja_induk               direktorat_fakultas
pejabat_penilai_nip            atasan_pejabat_penilai_nip
tanggal_masuk                  tanggal_keluar
rezim (enum: A | B | perlu_verifikasi)
aktif (bool)                   sumber (enum: impor_excel | api_simpega | manual)
sumber_sinkron_terakhir (timestamptz)
```
`pejabat_penilai_nip` dan `atasan_pejabat_penilai_nip` adalah kunci penting: dipakai untuk menentukan **atasan langsung** secara otomatis saat membentuk tim atau membuat surat panggilan.

**`unit_kerja`** — hierarki unit (id, nama, induk_id, jenis, punya_delegasi_hukdis_ringan bool). Diisi dari nilai unik hasil impor + disunting admin. Kolom delegasi dipakai untuk aturan Pertor Pasal 14 ayat (3).

**`regulasi`** — lihat §4.2. Kolom: kode, nama, rezim, berlaku_dari, berlaku_sampai, catatan, aktif.

**`pasal_regulasi`** — katalog pasal per peraturan:
```
regulasi_id   jenis (kewajiban | larangan | hukuman | prosedur)
pasal         ayat   huruf   angka   teks   tingkat_hukuman_terkait
```
Diisi awal (seed) untuk `PP_94_2021` (Pasal 3, 4, 5 lengkap; Pasal 9–14 pemetaan) dan `PERTOR_70_2026` (Pasal 5 huruf a–r, Pasal 6 huruf a–s; Pasal 9–11 pemetaan). Admin bisa menambah.

**`jenis_hukuman`** — lihat §4.3. Kolom: regulasi_id, tingkat, nama, durasi_bulan, aktif, pengganti_sementara_id, catatan.

**`hari_libur`** — tanggal, nama, jenis (libur_nasional | cuti_bersama). Wajib diisi per tahun oleh admin; dipakai kalkulator hari kerja.

### 6.2 Transaksi

**`entri`** — tabel induk untuk keempat kelas (§5):
```
nomor_registrasi (text, unique, auto)   kelas (informasi|non_hukdis|arsip|hukdis)
judul            ringkasan              tanggal_peristiwa   tahun_peristiwa
pegawai_id (nullable)                   nama_pegawai_bebas (untuk arsip tanpa master)
unit_kerja_id    regulasi_id            rezim
status_kasus     tingkat_hukuman_dugaan jenis_hukuman_id (final)
sumber_informasi (surat|laporan_lisan|disposisi|temuan_spi|presensi|lainnya)
pelapor_nama     pelapor_kontak         ada_bukti (bool)
hitung_dalam_sla (bool, default true; selalu false untuk kelas informasi & arsip)
kelengkapan_berkas                      pemotongan_ik (bool)
rahasia_tingkat (biasa|rahasia; default rahasia)
catatan_internal
```
Nomor registrasi: `SIMPEL/{KELAS}/{TAHUN}/{URUT4}`, contoh `SIMPEL/HD/2026/0007`.

**`pelanggaran_entri`** — banyak pasal per kasus: `entri_id`, `pasal_regulasi_id`, `uraian_perbuatan`, `dampak` (unit_kerja | instansi | negara), `waktu`, `tempat`.

**`tahapan_kasus`** — `entri_id`, `kode_tahap`, `urutan`, `nama`, `status` (belum|berjalan|selesai|dilewati), `tanggal_rencana`, `tanggal_realisasi`, `tenggat`, `pic_user_id`, `catatan`.

**`tim_pemeriksa`** — `entri_id`, `jenis` (unit_kerja|um|atasan_langsung), `nomor_sk`, `tanggal_sk`, `pejabat_pembentuk`, `dilaporkan_ke_sekjen_pada` (nullable).

**`anggota_tim`** — `tim_id`, `pegawai_id`, `unsur` (atasan_langsung|pengawasan|kepegawaian|lain), `jabatan_dalam_tim` (ketua|sekretaris|anggota), `pernyataan_bebas_konflik` (bool), `eselon_setara` (int, untuk validasi tidak lebih rendah).

**`dokumen`** — `entri_id`, `jenis_dokumen`, `nomor`, `tanggal`, `template_id`, `data_isian` (jsonb), `file_path`, `versi`, `status` (draf|final|ditandatangani), `dibuat_oleh`.

**`berkas`** — lampiran/pindaian: `entri_id`, `nama_file`, `file_path`, `mime`, `ukuran`, `kategori` (bukti|pindaian_arsip|rekaman|lainnya), `teks_ocr` (nullable, untuk pencarian).

**`sesi_pemeriksaan`** — lihat §9: `entri_id`, `urutan` (I|II), `tanggal`, `jam_mulai`, `jam_selesai`, `tempat`, `moda` (tatap_muka|virtual), `terperiksa_hadir` (bool), `notulis_user_id`, `persetujuan_rekam` (bool), `persetujuan_rekam_file`, `rekaman_path`, `rekaman_hapus_pada` (date).

**`qa_pemeriksaan`** — `sesi_id`, `urutan`, `pertanyaan`, `jawaban`, `kategori` (baku|substansi|penutup), `terakhir_disimpan`.

**`hukuman`** — hasil akhir: `entri_id`, `jenis_hukuman_id`, `nomor_sk`, `tanggal_sk`, `pejabat_penjatuh`, `tanggal_diterima_pegawai`, `tanggal_mulai_berlaku` (hitung: hari kerja ke-15), `tanggal_selesai` (hitung: +12 bulan jika berlaku), `pemotongan_ik`, `blokir_kgb` (bool), `blokir_kenaikan_pangkat` (bool).

**`upaya_administratif`** — `entri_id`, `jenis` (keberatan|banding), `tanggal_pengajuan`, `diajukan_kepada`, `tanggal_putusan`, `hasil` (dikuatkan|diperingan|dibatalkan), `nomor_putusan`, `catatan`.

**`penghentian_gaji`** — `entri_id`, `tanggal_mulai_tmk`, `jumlah_hari_berturut`, `tanggal_lapor_atasan`, `tanggal_verval`, `tanggal_sk_kpa`, `nomor_sk_kpa`, `status`.

**`audit_log`** — `user_id`, `email`, `aksi` (lihat|buat|ubah|hapus|unduh|cetak|ekspor), `tabel`, `record_id`, `entri_id`, `ringkasan_perubahan` (jsonb), `ip`, `user_agent`, `waktu`. **Tidak bisa diubah atau dihapus siapa pun**, termasuk admin (tanpa kebijakan UPDATE/DELETE di RLS).

**`template_dokumen`** dan **`template_placeholder`** — lihat §7.

### 6.3 Nilai terhitung (tampilkan, jangan simpan ganda)
- Hari kerja ke-15 sejak tanggal terima → tanggal mulai berlaku
- Sisa hari menuju setiap tenggat, dengan warna: hijau >3 hari, kuning 1–3 hari, merah lewat
- Akumulasi hari TMK tahun berjalan per pegawai, dengan ambang berikutnya
- Riwayat hukuman pegawai → pemicu aturan pengulangan (§4.6)

---

## 7. Pembangkit dokumen dengan template yang bisa diatur

Ini fitur pembeda. **Pendekatan: unggah `.docx` asli + penanda placeholder.** Keluaran `.docx` yang format, kop, tabel, dan spasinya persis seperti berkas aslinya, sehingga tinggal disunting sedikit di Word lalu dicetak.

### 7.1 Teknologi
`docxtemplater` + `pizzip` di sisi server (Node). Modul tabel/perulangan memakai sintaks loop bawaan docxtemplater (`{#daftar}…{/daftar}`). **Jangan** memakai modul berbayar; cukupkan dengan fitur gratis: placeholder sederhana, kondisional, dan loop.

### 7.2 Alur kerja admin
1. Admin membuka **Pengaturan → Template Dokumen → Tambah**.
2. Unggah berkas `.docx` yang sudah diberi placeholder, misal `Surat Panggilan I` dengan isi `{nama_terperiksa}`, `{nip_terperiksa}`.
3. Sistem **memindai** berkas, menampilkan seluruh placeholder yang ditemukan, dan meminta admin memetakan tiap placeholder ke sumber data (dropdown dari katalog §7.4) atau menandainya sebagai isian manual.
4. Admin mengisi metadata: jenis dokumen, rezim (A/B/keduanya), tingkat hukuman yang relevan, tahap kasus tempat template ini dipakai, dan apakah ini versi aktif.
5. **Versi:** mengunggah ulang template yang sama membuat versi baru; versi lama tetap tersimpan supaya dokumen lama bisa dibuat ulang persis seperti dulu. Dokumen yang sudah terbit menyimpan `template_versi_id`.
6. Tombol **Uji** menghasilkan dokumen contoh dengan data dummy supaya admin bisa memeriksa hasilnya sebelum diaktifkan.

### 7.3 Alur kerja pengguna
Di halaman kasus, tiap tahap menampilkan tombol dokumen yang relevan untuk tahap itu. Klik → sistem mengisi otomatis semua placeholder yang bisa diambil dari basis data → tampilkan formulir berisi **hanya** isian yang belum terisi → pratinjau → **Unduh .docx**. Dokumen tercatat di tabel `dokumen` dengan nomor, tanggal, dan jejak audit.

Tambahkan tombol **Unduh PDF** (konversi via LibreOffice headless di server, atau pustaka setara) untuk keperluan arsip, sementara `.docx` tetap yang utama.

### 7.4 Katalog placeholder bawaan (seed)

Sediakan minimal ini, dikelompokkan supaya mudah dipilih admin:

**Terperiksa:** `nama_terperiksa`, `nama_terperiksa_tanpa_gelar`, `nip_terperiksa`, `pangkat_terperiksa`, `golongan_terperiksa`, `jabatan_terperiksa`, `unit_kerja_terperiksa`, `fakultas_terperiksa`, `tempat_lahir_terperiksa`, `tanggal_lahir_terperiksa`

**Kasus:** `nomor_registrasi`, `uraian_dugaan`, `pasal_dilanggar` (teks terangkai, contoh: "Pasal 5 huruf f dan Pasal 6 huruf j"), `nama_regulasi`, `tingkat_hukuman`, `jenis_hukuman`, `dampak_perbuatan`, `faktor_memberatkan`, `faktor_meringankan`, `waktu_perbuatan`, `tempat_perbuatan`

**Surat:** `nomor_surat`, `tanggal_surat`, `tanggal_surat_panjang` (contoh: "4 Oktober 2026"), `tempat_surat`, `sifat_surat`, `hal_surat`, `lampiran_surat`

**Pemeriksaan:** `hari_pemeriksaan`, `tanggal_pemeriksaan`, `tanggal_pemeriksaan_terbilang` (contoh: "tanggal empat bulan Oktober tahun dua ribu dua puluh enam"), `jam_pemeriksaan`, `tempat_pemeriksaan`, `nomor_panggilan_1`, `tanggal_panggilan_1`, `nomor_panggilan_2`, `tanggal_panggilan_2`

**Tim pemeriksa (loop):** `{#anggota_tim}` dengan field `nama`, `nip`, `pangkat`, `jabatan`, `unit_kerja`, `unsur`, `jabatan_dalam_tim` `{/anggota_tim}`

**Tanya jawab BAP (loop):** `{#qa}` dengan `nomor`, `pertanyaan`, `jawaban` `{/qa}`

**Pejabat:** `nama_pejabat_penjatuh`, `nip_pejabat_penjatuh`, `jabatan_pejabat_penjatuh`, `nama_atasan_langsung`, `nip_atasan_langsung`, `jabatan_atasan_langsung`, `nama_rektor`, `nip_rektor`

**SK:** `nomor_sk`, `tanggal_sk`, `tanggal_mulai_berlaku`, `tanggal_selesai_hukuman`, `konsideran_menimbang` (loop `{#menimbang}`), `konsideran_mengingat` (loop `{#mengingat}`)

**Rekapitulasi kehadiran (loop):** `{#rekap_tmk}` dengan `tahun`, `jan`…`des`, `jumlah` `{/rekap_tmk}`

### 7.5 Template yang di-seed di awal

Siapkan 16 template berikut sebagai data awal, diambil dari berkas Word yang disediakan pemilik produk (lihat `/templates-sumber/`). Yang belum ada berkasnya, buat versi dasar yang rapi.

| # | Jenis dokumen | Rezim | Sumber |
|---|---|---|---|
| 1 | Surat Panggilan I / II | A, B | `1. Surat Panggilan.docx` |
| 2 | Berita Acara Pemeriksaan | A, B | `2. BAP.docx` — berisi 17 pertanyaan baku |
| 3 | Berita Acara Ketidakhadiran Pemeriksaan | A, B | `8. BAP apabila terperiksa tidak hadir.docx` |
| 4 | Pembentukan Tim Pemeriksa | A, B | `3. SK Tim Pemeriksa.doc` |
| 5 | Surat Tugas Tim Sekretariat | A | `7. SURAT TUGAS TIM SEKRETARIAT.docx` |
| 6 | Laporan Hasil Pemeriksaan | A, B | `4. LHP.docx` |
| 7 | LHP (terperiksa tidak hadir) | A, B | `3. LHP tidak hadir.docx` |
| 8 | Nota Dinas Laporan Kewenangan | A | `5. CONTOH LAPORAN KEWENANGAN.doc` |
| 9 | Surat Usul Pemberhentian ke Menteri | A | `6. CONTOH SURAT USUL KE MENTERI.doc` |
| 10 | Rekapitulasi Ketidakhadiran Kerja | A, B | `9. REKAPITULASI.docx` |
| 11 | Surat Keterangan Kesaksian Rekan Sejawat | A, B | `10. SURAT KETERANGAN REKAN SEJAWAT.docx` |
| 12 | Kronologi | A, B | `11. Contoh Kronologis.docx` |
| 13 | SK Penjatuhan Hukuman Disiplin | A, B | `SK HUKDIS RINGAN TEGURAN LISAN.docx` |
| 14 | Surat Panggilan Penerimaan Keputusan HD | B | Pertor 70/2026 Lampiran Angka 7 |
| 15 | SK Pembebasan Sementara dari Tugas Jabatan | A, B | Pertor 70/2026 Lampiran Angka 5 |
| 16 | Surat pelaporan salinan SK Tim Pemeriksa ke Sekjen | A | Buat baru (Kepmen 84/2025 Diktum KELIMA) |

**Perhatian saat menyiapkan template #13:** berkas sumber yang ada mengandung kesalahan rujukan — mengutip "Pasal 3 huruf f, Pasal 4 huruf c, Pasal 10 ayat (1) huruf e dan ayat (2) huruf c" tetapi menyebut Peraturan Rektor Nomor 70 Tahun 2026. Penomoran itu milik PP 94/2021. Di Pertor 70/2026, kewajiban ada di Pasal 5 dan larangan di Pasal 6. Ganti bagian itu dengan placeholder `{pasal_dilanggar}` dan `{nama_regulasi}` yang diisi sistem dari katalog pasal, jangan disalin apa adanya. Sebutkan koreksi ini saat melapor ke pemilik produk.

---

## 8. Data pegawai: impor Excel dan API

Ada dua jalur, karena API dari UPT PTIK lebih sedikit kolomnya daripada tarikan Excel Simpega.

### 8.1 Impor Excel (jalur utama)
Berkas acuan: `simpega.um.ac.id-laporan-rekap.xlsx` — 70 kolom, baris pertama header.

**Peringatan teknis:** berkas ini punya **nama kolom yang berulang** — `No SK` muncul 3 kali, `TMT` 3 kali, `Unit Kerja` 2 kali, dan 2 kolom terakhir tanpa nama. Karena itu **pemetaan harus berdasarkan posisi kolom (indeks), bukan nama**. Buat antarmuka pemetaan yang menampilkan indeks, nama header, dan 3 contoh nilai per kolom, lalu pengguna memilih field tujuan. Simpan profil pemetaan supaya impor berikutnya tinggal pakai ulang.

**Kolom yang WAJIB TIDAK diimpor** (data pribadi sensitif yang tidak diperlukan untuk urusan disiplin, dan menambah risiko kebocoran di bawah UU 27/2022 tentang Pelindungan Data Pribadi):

> `KK`, `NIK`, `NPWP`, `NO BPJS`, `IBU KANDUNG`, `Rekening`, `Gaji Pokok(Rp)`, `Alamat Asal`, `Alamat Domisili`, `Alamat KTP`, `Tanggal Nikah`, `Nama Pasangan`, `Pekerjaan Pasangan`, `Agama`, `Status Pernikahan`, `HP`, `Email Alternatif 1`, `Email Alternatif 2`

Importer harus **menolak** kolom-kolom ini secara keras: jangan ditawarkan di dropdown pemetaan, dan tampilkan keterangan "kolom ini sengaja tidak disimpan SIMPEL". Jika kelak dibutuhkan (misal status pernikahan untuk kasus PP 10/1983), tambahkan lewat perubahan terencana dengan dasar tertulis, bukan diam-diam.

Alur impor: unggah → pratinjau 10 baris → petakan kolom → validasi (NIP duplikat, format tanggal, nilai `Status Pegawai` tak dikenal) → tampilkan ringkasan "x baris baru, y diperbarui, z ditolak beserta alasannya" → konfirmasi → jalankan. Semua impor tercatat di `audit_log` dan di riwayat impor yang bisa dilihat.

Normalisasi: tanggal `DD-MM-YYYY` → `date`; `Golongan Pangkat` seperti "Penata Muda Tingkat I, III/b" dipecah menjadi nama pangkat dan golongan ruang; `Jenis Kelamin` L/P.

### 8.2 API Simpega (jalur pelengkap)
Buat lapisan adapter `lib/simpega/` dengan antarmuka yang sama, sehingga sumber data bisa diganti tanpa mengubah aplikasi. Endpoint, autentikasi, dan daftar field diisi dari variabel lingkungan; jika belum tersedia, biarkan nonaktif dan tampilkan di Pengaturan sebagai "belum dikonfigurasi".

Kebijakan penggabungan: **Excel adalah sumber kebenaran untuk field yang hanya ada di Excel**; API dipakai untuk menyegarkan field yang dia punya. Setiap record menyimpan `sumber` dan `sumber_sinkron_terakhir`. Jangan pernah menimpa data hasil suntingan manual tanpa konfirmasi.

---

## 9. Mode sidang — pencatatan langsung saat pemeriksaan

Layar khusus (`/kasus/[id]/sidang/[sesi]`) yang dipakai notulis saat pemeriksaan berlangsung.

**Fungsi inti:**
- Panel kiri: identitas terperiksa dan anggota tim (terisi otomatis), tombol tandai hadir/tidak hadir.
- Panel utama: daftar pertanyaan. **17 pertanyaan baku** dari template BAP sudah terisi lebih dulu (pembukaan: konfirmasi terima surat panggilan, paham maksud pemanggilan, keadaan sehat dan bersedia diperiksa, kesediaan memberi keterangan jujur mengingat sumpah, riwayat pekerjaan, hambatan tugas, cara mengatasi; lalu blok pertanyaan substansi; penutup: kesadaran implikasi sanksi, kesiapan menerima konsekuensi, pernyataan tambahan dengan tenggang 2×24 jam, kesediaan diperiksa ulang, penegasan tidak ditekan atau dipaksa).
- Notulis mengetik jawaban per nomor. **Simpan otomatis tiap 5 detik dan setiap kali pindah field.** Tampilkan indikator "tersimpan pukul HH:MM:SS".
- Tombol **+ Pertanyaan substansi** menyisipkan pertanyaan baru di tengah; penomoran menyesuaikan sendiri.
- Bank pertanyaan: admin bisa menyimpan set pertanyaan substansi per jenis pelanggaran untuk dipakai ulang.
- Penghitung durasi sesi berjalan.
- Tombol **Selesai & Susun BAP** → menghasilkan `.docx` BAP lengkap dengan seluruh tanya jawab, siap disunting dan dicetak.

**Tahan gangguan:** simpan draf di penyimpanan lokal peramban juga, supaya jaringan putus tidak menghilangkan ketikan; sinkronkan begitu tersambung lagi.

### 9.1 Rekaman audio — dengan pengaman wajib

Pemilik produk meminta rekaman audio sebagai cadangan bukti. Ini sah, tetapi menyentuh data pribadi dan hak terperiksa. **Sistem tidak boleh merekam tanpa seluruh pengaman berikut aktif:**

1. **Persetujuan tertulis di muka.** Tombol rekam terkunci sampai kolom `persetujuan_rekam` ditandai dan berkas persetujuan yang ditandatangani terperiksa diunggah. Sediakan template "Surat Persetujuan Perekaman Pemeriksaan" yang menerangkan tujuan, siapa yang bisa mengakses, berapa lama disimpan, dan hak terperiksa meminta salinan.
2. **Pemberitahuan terlihat.** Selama merekam, tampilkan indikator merah mencolok di layar yang juga terlihat oleh terperiksa.
3. **Jika persetujuan ditolak**, pemeriksaan tetap berjalan normal tanpa rekaman. Catat penolakan itu di BAP. Jangan pernah memperlakukan penolakan sebagai hal yang memberatkan.
4. **Penyimpanan terenkripsi.** Bucket Supabase Storage privat, tidak ada URL publik, akses hanya lewat signed URL berumur pendek (≤5 menit) yang dikeluarkan server setelah memeriksa peran. Aktifkan enkripsi di sisi penyimpanan.
5. **Retensi terbatas.** Kolom `rekaman_hapus_pada` wajib terisi, bawaan **90 hari setelah kasus berstatus selesai atau dihentikan**. Jalankan tugas terjadwal harian yang menghapus rekaman yang sudah lewat dan mencatatnya di audit log. Admin bisa memperpanjang satu kali dengan alasan tertulis.
6. **Setiap pemutaran dan pengunduhan rekaman tercatat** di `audit_log` dengan identitas pengakses.
7. **Tanpa transkripsi otomatis di v1.** Mengirim rekaman pemeriksaan ke layanan transkripsi pihak ketiga memindahkan data pribadi sensitif ke luar kendali UM. Jika kelak diinginkan, bahas dulu dasar hukum dan pemrosesnya.

Rekam di peramban memakai `MediaRecorder` (format `audio/webm; codecs=opus`), unggah bertahap per potongan supaya sesi panjang tidak gagal di akhir.

---

## 10. Monitoring dan evaluasi

**Dashboard utama** (muncul setelah login):
- Kartu ringkas: kasus aktif, kasus mendekati tenggat (≤3 hari kerja), kasus lewat tenggat, informasi belum berproses, kasus selesai tahun ini
- **Papan tahapan (kanban)**: kolom per status kasus, kartu bisa diklik
- **Daftar tenggat terdekat** 14 hari ke depan, dengan nama kasus, tahap, dan sisa hari
- Grafik: kasus per tingkat hukuman, kasus per unit kerja, kasus per rezim, tren per bulan
- **Pegawai mendekati ambang kehadiran**: daftar pegawai dengan akumulasi TMK mendekati ambang berikutnya

**Yang tidak dihitung di seluruh angka di atas:** entri kelas `informasi` dan `arsip`. `informasi` ditampilkan terpisah sebagai angka tersendiri; `arsip` hanya muncul di modul pencarian dan statistik historis.

**Laporan yang bisa diekspor** (Excel dan PDF):
- Rekapitulasi hukuman disiplin per periode, per unit kerja, per tingkat
- Daftar kasus berjalan beserta posisi tahapan dan penanggung jawab
- Riwayat hukuman disiplin per pegawai (untuk bahan pembinaan dan penilaian)
- Daftar pegawai yang sedang menjalani hukuman (bahan blokir KGB/kenaikan pangkat dan pemotongan insentif kinerja)
- Rekap kepatuhan tenggat: berapa persen tahapan selesai tepat waktu

Setiap ekspor tercatat di audit log, dan berkas hasil ekspor diberi tanda air "RAHASIA" serta identitas pengunduh dan waktu unduh.

---

## 11. Keamanan dan kerahasiaan

Dokumen surat panggilan, berita acara pemeriksaan, dan bahan lain yang menyangkut hukuman disiplin **bersifat rahasia** menurut PerBKN 6/2022 Pasal 57 dan Pertor 70/2026 Pasal 36. Perlakukan ini sebagai persyaratan, bukan anjuran.

**Wajib ada:**
1. Row Level Security aktif di semua tabel; tidak ada kebijakan `USING (true)` untuk peran anon.
2. Service role key hanya di server. Tidak pernah dikirim ke peramban, tidak pernah masuk repo. Periksa dengan `git secrets` atau sejenisnya sebelum commit.
3. Semua berkas di bucket **privat**. Akses hanya lewat signed URL berumur pendek dari server.
4. Audit log mencatat **termasuk peristiwa membaca** kasus dan mengunduh dokumen. Tabel ini tidak punya kebijakan UPDATE maupun DELETE.
5. Sesi berakhir otomatis setelah 30 menit tidak aktif.
6. Halaman daftar menyembunyikan nama pegawai di balik tombol "tampilkan" jika pengguna membuka dari jaringan yang tidak dikenal — opsional, tapi minimal sediakan tombol **"Mode privasi"** yang menyamarkan nama dan NIP di layar (berguna saat presentasi atau rapat).
7. Pencetakan dan pengunduhan memberi header "RAHASIA" pada dokumen.
8. Tidak ada data asli pegawai di lingkungan pengembangan dan pratinjau. Gunakan proyek Supabase terpisah untuk `development` dan `production`.
9. Cadangan basis data otomatis harian (fitur bawaan Supabase) dan uji pemulihan sekali.
10. Kebijakan kata sandi dan autentikasi dua langkah diaktifkan di Clerk untuk semua akun.

**Catatan untuk pemilik produk (sampaikan saat melapor):** data yang ditangani SIMPEL termasuk data pribadi yang bersifat spesifik. Sebaiknya minta penetapan tertulis dari Direktur SDMK mengenai siapa pengendali data, berapa lama arsip disimpan, dan bagaimana prosedur pemusnahan — supaya sistem punya dasar kebijakan, bukan hanya dasar teknis.

---

## 12. Kebutuhan antarmuka

Pengguna adalah pejabat struktural yang bukan pengguna teknologi harian. Antarmuka harus bisa dipakai tanpa pelatihan.

- **Responsif penuh.** Harus nyaman di laptop (utama), tablet (saat rapat), dan ponsel (saat memeriksa status di jalan). Mode sidang harus tetap bisa dipakai di tablet.
- **Bahasa Indonesia** seluruhnya, termasuk pesan kesalahan. Tidak ada istilah teknis yang bocor ke pengguna ("gagal menyimpan, periksa sambungan internet" — bukan "500 Internal Server Error").
- **Ukuran huruf minimal 15px** untuk teks isi; kontras memenuhi WCAG AA; target sentuh minimal 44px.
- **Alur berbasis tahapan**, bukan formulir raksasa. Tiap tahap satu layar, dengan indikator kemajuan di atas.
- **Simpan otomatis** di semua formulir panjang.
- **Pencarian global** di kepala halaman: nama, NIP, nomor registrasi, nomor surat, isi dokumen hasil OCR.
- **Mode gelap dan terang**, mengikuti pengaturan perangkat.
- **Tidak ada penghapusan permanen** dari antarmuka biasa. Hapus = arsipkan (soft delete) dengan alasan; hanya admin yang bisa memusnahkan, dan itu pun tercatat.
- **Bantuan kontekstual**: ikon tanda tanya di tiap tahap yang menampilkan kutipan pasal dasar tahap itu, supaya pengguna tahu kenapa tahap itu ada.

Komponen: shadcn/ui di atas Tailwind. Palet: netral dengan satu warna aksen; gunakan warna status yang konsisten (hijau aman, kuning mendekati tenggat, merah lewat tenggat, abu-abu arsip).

---

## 13. Teknologi

| Lapisan | Pilihan | Alasan |
|---|---|---|
| Framework | Next.js 15 (App Router) + TypeScript | Satu basis kode untuk UI dan server; Vercel asli |
| Gaya | Tailwind CSS + shadcn/ui | Cepat, konsisten, responsif |
| Basis data | Supabase (PostgreSQL) | Sudah dimiliki; RLS, Storage, cadangan otomatis |
| Berkas | Supabase Storage (bucket privat) | Sekalian |
| Autentikasi | Clerk | Sudah dimiliki; Google OAuth + allowlist |
| Hosting | Vercel | Sudah dimiliki |
| Dokumen | docxtemplater + pizzip | Menjaga format .docx asli |
| Excel | SheetJS (xlsx) untuk impor, ExcelJS untuk ekspor | |
| Tabel | TanStack Table | Penyaringan, pengurutan, penomoran halaman |
| Grafik | Recharts | Ringan, cocok dengan React |
| Validasi | Zod | Satu skema untuk klien dan server |
| Tanggal | date-fns + locale `id` | Format Indonesia |
| Hari kerja | Fungsi sendiri yang membaca tabel `hari_libur` | Jangan pakai pustaka hari libur asing |
| Uji | Vitest (unit) + Playwright (alur utama) | |

**Perhitungan hari kerja wajib diuji unit** dengan sekurangnya kasus: melewati akhir pekan, melewati libur nasional, melewati cuti bersama, dan melewati pergantian tahun.

---

## 14. Struktur proyek yang diharapkan

```
simpel/
├─ app/
│  ├─ (auth)/            masuk, akses-ditolak
│  ├─ (app)/
│  │  ├─ beranda/        dashboard + monev
│  │  ├─ informasi/      kotak masuk informasi (tidak masuk SLA)
│  │  ├─ kasus/          daftar, [id] detail, [id]/sidang/[sesi]
│  │  ├─ arsip/          kasus lampau
│  │  ├─ pegawai/        master + riwayat hukuman
│  │  ├─ laporan/        ekspor
│  │  └─ pengaturan/     pengguna, template, regulasi, pasal,
│  │                     jenis hukuman, hari libur, impor, audit log
│  └─ api/
├─ components/
├─ lib/
│  ├─ supabase/          klien server & browser
│  ├─ auth/              penjaga peran, allowlist
│  ├─ dokumen/           docxtemplater, katalog placeholder, konversi PDF
│  ├─ simpega/           adapter impor Excel & API
│  ├─ regulasi/          resolver berbasis tanggal (§18.5) — satu-satunya
│  │                     tempat yang boleh menyentuh tabel regulasi
│  ├─ hukdis/            mesin aturan generik: membaca tabel, tidak memuat
│  │                     satu pun angka atau kode peraturan (§18.5)
│  └─ hari-kerja/        kalkulator + kalender libur
├─ supabase/
│  ├─ migrations/        SQL bernomor
│  └─ seed/              regulasi, pasal, jenis hukuman, template, hari libur
├─ templates-sumber/     16 berkas .docx dari pemilik produk
├─ tests/
├─ .env.example
└─ README.md             panduan pakai berbahasa Indonesia, bergambar
```

---

## 15. Rencana eksekusi — kerjakan berurutan

### Tahap 0 — Persiapan dan kredensial
Minta pemilik produk menyiapkan, dengan instruksi klik yang jelas:
- Akun GitHub + personal access token berhak `repo`
- Proyek Supabase baru bernama `simpel-prod` dan satu lagi `simpel-dev` → salin `URL`, `anon key`, `service_role key`
- Aplikasi Clerk baru → aktifkan Google OAuth → salin `publishable key` dan `secret key` → atur **Restrictions → Allowlist** berisi 5 alamat email
- Akun Vercel tertaut ke GitHub

Buat `.env.local` dan `.env.example`. Pastikan `.env*` masuk `.gitignore`.

### Tahap 1 — Fondasi
Inisiasi Next.js + TypeScript + Tailwind + shadcn/ui. Buat repo GitHub privat `simpel`, dorong commit pertama. Hubungkan ke Vercel, pastikan halaman kosong sudah hidup di URL produksi. **Laporkan URL-nya.**

### Tahap 2 — Autentikasi dan hak akses
Pasang Clerk, buat tabel `app_users`, halaman "Akses belum diberikan", penjaga peran di server. Isi 5 pengguna. **Uji: login dengan email di luar daftar harus ditolak.**

### Tahap 3 — Basis data
Tulis seluruh migrasi §6 **dan §18.2** sekaligus — jangan dipisah. Aktifkan RLS. Pasang trigger anti-ubah untuk katalog aturan (§18.4). Buat seed: `regulasi`, `tingkat_hukuman`, `pasal_regulasi` (PP 94/2021 dan Pertor 70/2026 lengkap; PP 30/1980 dan PP 53/2010 cukup jenis hukuman + ambang kehadiran untuk keperluan arsip), `jenis_hukuman`, `ambang_kehadiran`, `aturan_tenggat`, `aturan_kewenangan`, `aturan_pemetaan_pelanggaran`, `aturan_kaidah`, `hari_libur` 2026–2027, dan `unit_kerja`.

Tulis uji unit kalkulator hari kerja **dan** fixture uji regresi hukum (§18.9): minimal 3 skenario per peraturan dengan hasil yang sudah diverifikasi terhadap bunyi pasalnya.

### Tahap 4 — Master pegawai
Importer Excel dengan pemetaan berbasis posisi kolom dan daftar larangan §8. Impor berkas dummy 1.000 baris sebagai uji. Halaman daftar dan detail pegawai dengan riwayat hukuman. Adapter API disiapkan tapi nonaktif.

### Tahap 5 — Kotak masuk informasi dan arsip
Kelas `informasi` (tanpa SLA) dengan tombol naikkan jadi kasus; kelas `arsip` dengan unggah pindaian dan kolom serba opsional. Keduanya lebih dulu dari kasus aktif, karena inilah yang paling cepat memberi manfaat: berkas lama bisa langsung dimasukkan sambil fitur lain dibangun.

### Tahap 6 — Kasus hukdis dan mesin aturan
Entri kasus, pemilihan pasal terikat peraturan, mesin kewenangan §4.5, generator tahapan §5.4, kalkulator tenggat, kalkulator ambang kehadiran, tim pemeriksa dengan validasi jabatan.

### Tahap 7 — Pembangkit dokumen
docxtemplater, unggah template, pemindaian placeholder, pemetaan, versi, pratinjau, unduh .docx dan PDF. Seed 16 template. **Uji: hasilkan Surat Panggilan I dan BAP dari satu kasus contoh, bandingkan dengan berkas Word asli.**

### Tahap 8 — Mode sidang
Layar sidang, 17 pertanyaan baku, simpan otomatis, bank pertanyaan, susun BAP. Rekaman audio dengan seluruh pengaman §9.1 — **jangan aktifkan tombol rekam sebelum alur persetujuan selesai dibangun.**

### Tahap 9 — Monev dan laporan
Dashboard, papan tahapan, daftar tenggat, grafik, lima laporan ekspor.

### Tahap 10 — Pengerasan dan serah terima
Audit RLS menyeluruh, uji Playwright untuk alur utama, uji di ponsel dan tablet, cadangan dan uji pemulihan, tulis `README.md` berbahasa Indonesia yang bergambar untuk pengguna awam, dan **buat panduan singkat "cara menambah template surat baru"** karena itu yang paling sering dilakukan pemilik produk.

---

## 16. Kriteria penerimaan

Sistem dianggap selesai jika semua pernyataan berikut benar:

1. Lima pengguna bisa masuk lewat Google; email di luar daftar ditolak.
2. Satu lembar kronologi tahun 1995 bisa dicatat sebagai arsip hanya dengan nama, tahun, dan satu baris uraian, lalu pindaiannya terunggah dan bisa ditemukan lewat pencarian.
3. Surat masuk tanpa pelapor dan tanpa bukti bisa dicatat sebagai informasi, **tidak muncul** di angka kasus aktif maupun hitungan tenggat, dan bisa dinaikkan jadi kasus saat buktinya ada.
4. Membuat kasus baru untuk pegawai berstatus PNS otomatis memakai PP 94/2021, dan daftar pasal yang ditawarkan **hanya** pasal PP 94/2021.
5. Membuat kasus untuk pegawai PTNA otomatis memakai Pertor 70/2026, dan hukuman sedang/berat otomatis bertanda pemotongan insentif kinerja.
6. Memasukkan "pegawai tidak masuk kerja 15 hari" menghasilkan usulan hukuman sedang jenis kedua, dengan rujukan pasalnya.
7. Kasus ASN dengan ancaman berat menampilkan tahapan pembentukan Tim Pemeriksa oleh Rektor **dan** tugas melaporkan salinan SK ke Sekjen.
8. Menambah anggota tim yang jabatannya lebih rendah dari terperiksa **ditolak** dengan pesan yang menyebut dasar aturannya.
9. SK ditetapkan 10 Juli, diterima pegawai 14 Juli → sistem menghitung tanggal mulai berlaku pada hari kerja ke-15, melewati akhir pekan dan hari libur dengan benar.
10. Admin bisa mengunggah template .docx baru, memetakan placeholder, dan menghasilkan surat tanpa bantuan programmer.
11. Dokumen hasil sistem dibuka di Word dengan kop, tabel, dan spasi persis seperti template aslinya.
12. Mode sidang bisa dipakai di tablet, menyimpan otomatis, dan menghasilkan BAP berisi seluruh tanya jawab.
13. Tombol rekam terkunci sampai persetujuan tertulis terunggah.
14. Membuka satu kasus memunculkan baris baru di audit log.
15. Seluruh layar utama bisa dipakai di layar selebar 390px tanpa gulir mendatar.
16. Aplikasi hidup di URL Vercel dan bisa dibuka pemilik produk dari ponselnya.

**Uji ketahanan terhadap perubahan aturan — wajib lulus semua:**

17. **Uji peraturan fiktif.** Lewat layar admin saja, tanpa menyentuh kode dan tanpa migrasi basis data, seorang admin bisa mendaftarkan "PP 99 Tahun 2030" dengan **4 tingkat** hukuman, **12 jenis** hukuman, ambang kehadiran yang berbeda, tenggat panggilan 10 hari kerja, dan matriks kewenangan sendiri — lalu membuat kasus baru yang memakainya dengan benar.
18. **Uji kekebalan arsip.** Setelah peraturan baru diaktifkan dan katalog pasal lama disunting, **buka kembali kasus lama**: nama jenis hukuman, kutipan pasal, dan dokumen yang sudah terbit **tidak berubah sedikit pun**.
19. **Uji resolusi berbasis tanggal.** Kasus dengan tanggal peristiwa 12 Mei 2015 otomatis memakai PP 53/2010 dan ambang 5/6–10/11–15; kasus 12 Mei 2024 memakai PP 94/2021 dan ambang 3/4–6/7–10. Tanpa pengguna memilih manual.
20. **Uji ekspor penuh.** Satu tombol menghasilkan arsip berisi seluruh data (JSON) dan seluruh berkas, bisa dibuka tanpa aplikasi SIMPEL.
21. **Nol angka hukum di dalam kode.** Pencarian teks di seluruh `lib/hukdis/` tidak menemukan angka ambang (3, 10, 28, 46), nama jenis hukuman, atau kode peraturan yang ditulis sebagai konstanta.

---

## 17. Yang perlu dikonfirmasi ke pemilik produk

Sampaikan daftar ini saat melapor; jangan menebak sendiri.

1. **Format penomoran surat** di UM — SIMPEL perlu tahu pola nomor SK dan surat (contoh dari berkas: `15.7.81/UN32/KP/2026`, `02 08/B.B1/RHS/KP.04.05/2025`). Apakah nomor diambil dari eOffice, atau SIMPEL yang menerbitkan?
2. **Status PP tentang Gaji dan Tunjangan ASN** — penentu apakah hukuman sedang bagi PNS sudah memakai pemotongan tunjangan kinerja atau masih penundaan KGB/pangkat. Perlu dicek ke JDIH BKN.
3. **Apakah Kepmendiktisaintek 84/M/KEP/2025 masih berlaku** — Diktum KEEMPAT memungkinkan penarikan delegasi oleh Menteri.
4. **Daftar lengkap unit kerja UM** beserta mana yang pimpinannya menerima delegasi hukuman ringan menurut Pertor 70/2026 Pasal 14 ayat (3).
5. **Kalender hari libur nasional dan cuti bersama** tahun berjalan.
6. **Kebijakan retensi arsip hukuman disiplin** di UM — berapa lama disimpan dan bagaimana pemusnahannya.
7. **Siapa yang menandatangani** tiap jenis dokumen, supaya placeholder pejabat bisa diisi benar.

---

## 18. Ketahanan terhadap perubahan aturan

Bagian ini mengikat seluruh dokumen. Kalau §4 dan §18 terbaca bertentangan, **§18 yang menang**.

### 18.1 Bukti bahwa aturan berubah — dan apa saja yang berubah

Empat generasi aturan disiplin yang pernah dan sedang berlaku, dibandingkan pada dimensi yang paling sering diasumsikan tetap oleh pembuat aplikasi:

| Dimensi | PP 30/1980 | PP 53/2010 | PP 94/2021 | Pertor 70/2026 |
|---|---|---|---|---|
| Jumlah kewajiban | 26 (Psl 2 huruf a–z) | 17 (Psl 3 angka 1–17) | 17 (Psl 3: 8 + Psl 4: 9) | 18 (Psl 5 huruf a–r) |
| Jumlah larangan | 18 (Psl 3 huruf a–r) | 15 (Psl 4 angka 1–15) | 14 (Psl 5 huruf a–n) | 19 (Psl 6 huruf a–s) |
| Letak kewajiban | Pasal 2 | Pasal 3 | Pasal 3 **dan** Pasal 4 | Pasal 5 |
| Letak larangan | Pasal 3 | Pasal 4 | Pasal 5 | Pasal 6 |
| Jenis HD ringan | 3 | 3 | 3 | 3 |
| Jenis HD sedang | 3 — termasuk **penurunan gaji sebesar 1× KGB** | 3 | 3 — **pemotongan tunjangan kinerja 25%** | 3 |
| Jenis HD berat | 4 — termasuk **PTDH** | 5 — termasuk **pemindahan dalam rangka penurunan jabatan** dan **PTDH** | 3 — **tanpa PTDH** | 3 |
| **Total jenis hukuman** | **10** | **11** | **9** | **9** |
| Ambang TMK ringan | tidak diatur per hari | **5 / 6–10 / 11–15** | **3 / 4–6 / 7–10** | 3 / 4–6 / 7–10 |
| Ambang TMK sedang | tidak diatur per hari | **16–20 / 21–25 / 26–30** | **11–13 / 14–16 / 17–20** | sama |
| Ambang TMK berat | tidak diatur per hari | **31–35 / 36–40 / 41–45 / ≥46** | **21–24 / 25–27 / ≥28** | sama |
| TMK berturut-turut | tidak ada | tidak ada | **10 hari → PDHTAPS + gaji dihentikan** | sama |
| Kinerja sebagai pelanggaran | tidak ada | **ya** — SKP 25–50% → sedang; <25% → berat | tidak ada | kewajiban ada (Psl 5 huruf o) tapi tidak dipetakan |
| Keberatan atas HD ringan | tidak dapat diajukan | tidak dapat diajukan | diatur PP tersendiri | **dapat diajukan** |
| Banding administratif | BAPEK | BAPEK | PP tersendiri | **kepada Rektor** |
| Pemeriksa | atasan langsung | atasan langsung / tim | atasan langsung (ringan), tim (sedang/berat) | **tim bahkan untuk ringan** |

Perhatikan: **setiap baris yang dicetak tebal adalah hal yang akan merusak aplikasi** jika ditulis sebagai konstanta. Jumlah jenis hukuman pernah 10, 11, lalu 9. Ambang hari kerja pernah 5 lalu jadi 3. Satu jenis hukuman (PTDH) pernah ada, lalu hilang. Satu kategori pelanggaran (kinerja) pernah ada, lalu hilang, lalu muncul lagi sebagai kewajiban tanpa sanksi.

**Kesimpulan desain: satu-satunya hal yang stabil lintas generasi adalah *bentuk prosesnya* — ada pelanggaran, ada pemeriksaan, ada berita acara, ada keputusan, ada masa berlaku. Itulah yang boleh jadi kode. Sisanya data.**

### 18.2 Tabel tambahan yang wajib ada

Melengkapi §6. Semua terikat `regulasi_id`, semua bisa diisi lewat layar admin.

**`tingkat_hukuman`** — jangan pakai ENUM. `regulasi_id`, `kode`, `nama` ("ringan"), `urutan` (1,2,3,…), `aktif`. Peraturan dengan 4 tingkat cukup menambah baris.

**`ambang_kehadiran`** — `regulasi_id`, `hari_min`, `hari_max` (null = tak terhingga), `berturut_turut` (bool), `tingkat_hukuman_id`, `jenis_hukuman_id`, `pasal_rujukan`, `akibat_tambahan` (teks, misal "penghentian pembayaran gaji sejak bulan berikutnya"). Kalkulator cukup mencari baris yang rentangnya memuat angka hari.

**`aturan_tenggat`** — `regulasi_id`, `kode_tahap`, `nama_tenggat`, `dihitung_dari` (kode peristiwa), `arah` (sebelum|sesudah), `jumlah`, `satuan` (hari_kerja|hari_kalender|bulan), `sifat` (wajib_hukum|pengingat_internal), `pasal_rujukan`. Semua tenggat di §4.6 masuk sini sebagai baris. Yang di Pertor 70/2026 tidak diatur (tenggat upaya administratif) diisi dengan `sifat = pengingat_internal` supaya jelas bukan tenggat hukum.

**`aturan_kewenangan`** — `regulasi_id`, `tingkat_hukuman_id`, `peran_penjatuh` (kode jabatan), `lingkup` (satu_tingkat_di_bawah | dua_tingkat_di_bawah | seluruh_unit | tertentu), `syarat_tambahan` (jsonb), `pasal_rujukan`, `catatan`. Mesin kewenangan §4.5 membaca tabel ini, bukan menuliskan aturannya di kode.

**`aturan_pemetaan_pelanggaran`** — `regulasi_id`, `pasal_regulasi_id`, `dampak` (unit_kerja|instansi|negara|tidak_relevan), `tingkat_hukuman_id`, `pasal_rujukan_pemetaan`. Inilah yang memetakan "melanggar Pasal 5 huruf f dengan dampak pada instansi → hukuman sedang".

**`aturan_kaidah`** — kaidah umum yang juga berubah antar generasi, disimpan sebagai pasangan kunci–nilai bertanda peraturan: `regulasi_id`, `kunci`, `nilai` (jsonb), `pasal_rujukan`. Kunci yang wajib di-seed:

| Kunci | PP 94/2021 | Pertor 70/2026 |
|---|---|---|
| `hd_ringan_boleh_keberatan` | lihat PP tersendiri | `true` |
| `pemberat_pengulangan_berlaku_untuk_kehadiran` | `false` (PerBKN Psl 46 ayat 7) | tidak diatur |
| `satu_pelanggaran_satu_hukuman` | `true` | `true` |
| `larangan_hukum_dua_kali_satu_pelanggaran` | `true` (Psl 35 ayat 3) | **tidak diatur** |
| `pemeriksa_ringan` | `atasan_langsung` | `tim_pemeriksa_unit_kerja` |
| `tim_wajib_untuk` | `["berat"]` | `["ringan","sedang","berat"]` |
| `hari_berlaku_sk` | `15` + satuan `hari_kerja` | sama |
| `pemotongan_insentif_otomatis` | `false` | `true` untuk sedang & berat |
| `keberatan_ditujukan_kepada` | — | `pejabat_penjatuh` |
| `banding_ditujukan_kepada` | — | `rektor` |

Menambah peraturan baru = menambah baris di tabel-tabel ini. **Tidak ada migrasi, tidak ada deploy ulang.**

### 18.3 Prinsip kekal: riwayat tidak boleh berubah

Ini kaidah paling penting dan paling sering dilanggar aplikasi pemerintahan.

Setiap kasus, setiap dokumen, dan setiap keputusan hukuman menyimpan **salinan beku (snapshot)** dari apa yang dipakai saat itu, bukan sekadar penunjuk ke katalog:

- `entri.snapshot_regulasi` (jsonb) — kode, nama lengkap, dan tanggal berlaku peraturan saat kasus dibuat
- `pelanggaran_entri.snapshot_pasal` (jsonb) — **teks pasal utuh** sebagaimana tercatat saat itu
- `hukuman.snapshot_jenis_hukuman` (jsonb) — nama jenis hukuman dan durasinya saat SK ditetapkan
- `dokumen.snapshot_data` (jsonb) — seluruh nilai placeholder yang dipakai, plus `template_versi_id`

Akibatnya: admin boleh memperbaiki salah ketik di katalog pasal, menonaktifkan jenis hukuman, atau mengganti seluruh peraturan — **kasus dan dokumen yang sudah terbit tetap persis seperti aslinya**. Dokumen yang dicetak ulang tiga tahun lagi akan identik dengan yang dicetak hari ini.

Ini juga yang membuat SIMPEL bisa dipertanggungjawabkan kalau kelak ada sengketa: yang ditunjukkan adalah bunyi aturan pada saat keputusan diambil, bukan bunyi aturan hari ini.

### 18.4 Katalog bersifat tambah, bukan ubah

- Baris di `regulasi`, `pasal_regulasi`, `jenis_hukuman`, `ambang_kehadiran` yang **sudah pernah dipakai** tidak boleh di-UPDATE pada kolom substantifnya dan tidak boleh di-DELETE. Tegakkan lewat trigger basis data, bukan hanya lewat antarmuka.
- Perubahan substantif = buat baris baru dengan `versi` naik, isi `berlaku_sampai` pada baris lama, dan tautkan `digantikan_oleh_id`.
- Menghentikan pemakaian = `aktif = false`. Baris tetap ada selamanya supaya kasus lama tetap bisa dibaca.
- Koreksi salah ketik murni (tanpa mengubah makna) boleh di-UPDATE, tapi wajib tercatat di `audit_log` dengan alasan tertulis.

### 18.5 Resolver berbasis tanggal

Satu fungsi tunggal menjadi pintu masuk seluruh mesin aturan:

```ts
resolveRegulasi(rezim: Rezim, tanggalPeristiwa: Date): Regulasi
```

Mengembalikan peraturan yang berlaku pada tanggal itu, dengan mencocokkan `berlaku_dari <= tanggal < berlaku_sampai`. **Tidak ada satu pun bagian aplikasi yang boleh menyebut kode peraturan secara langsung.** Kalau resolver menemukan lebih dari satu kandidat atau tidak menemukan sama sekali, tampilkan pilihan manual kepada pengguna dengan penjelasan — jangan menebak diam-diam.

Seluruh fungsi lain menerima objek `Regulasi` sebagai parameter:
`hitungAmbangKehadiran(regulasi, jumlahHari)`, `tentukanKewenangan(regulasi, tingkat, jabatanTerperiksa, unitKerja)`, `hitungTenggat(regulasi, kodeTahap, tanggalDasar)`, `susunTahapan(regulasi, tingkat)`.

### 18.6 Wizard "Tambah Peraturan Baru"

Supaya admin yang awam koding benar-benar bisa melakukannya sendiri. Alur enam langkah:

1. **Identitas** — nomor, tahun, judul, rezim, tanggal berlaku, peraturan yang digantikan.
2. **Salin dari peraturan lama** — pilih satu peraturan sebagai titik awal; seluruh tingkat, jenis hukuman, ambang, tenggat, dan kewenangannya tersalin untuk disunting. Ini yang membuat pekerjaannya menyunting, bukan mengetik dari nol.
3. **Sunting kewajiban dan larangan** — tabel yang bisa ditambah/kurangi barisnya, dengan kolom pasal, ayat, huruf, angka, dan teks.
4. **Sunting tingkat, jenis hukuman, ambang kehadiran, tenggat, dan kewenangan.**
5. **Uji dengan kasus contoh** — masukkan skenario ("pegawai golongan III/b tidak masuk 18 hari"), sistem menampilkan tingkat, jenis, pejabat berwenang, dan seluruh tenggat yang dihasilkan. Admin memeriksa apakah sesuai bunyi peraturan. Bisa diulang berkali-kali.
6. **Aktifkan** — dengan tanggal mulai berlaku. Kasus baru setelah tanggal itu otomatis memakainya; kasus lama tidak tersentuh.

Sediakan juga **ekspor dan impor definisi peraturan** sebagai satu berkas JSON, supaya definisi bisa dibuat di luar sistem, ditinjau bagian hukum, lalu diimpor.

### 18.7 Yang boleh berubah tanpa menyentuh kode — daftar periksa

Kalau salah satu dari ini memerlukan programmer, desainnya salah:

- [ ] Terbit PP disiplin baru yang mengganti PP 94/2021
- [ ] Pertor 70/2026 diubah atau diganti
- [ ] Jumlah tingkat hukuman bertambah jadi 4
- [ ] Jenis hukuman ditambah, dikurangi, atau diganti namanya
- [ ] Ambang hari tidak masuk kerja berubah
- [ ] Hukuman sedang ASN beralih dari penundaan KGB ke pemotongan tunjangan kinerja
- [ ] Tenggat panggilan berubah dari 7 menjadi 10 hari kerja
- [ ] Delegasi kewenangan dari Menteri ditarik atau diperluas
- [ ] Daftar pimpinan unit kerja penerima delegasi Pertor berubah
- [ ] Format surat dari kementerian berganti
- [ ] Nomenklatur unit kerja UM berubah karena OTK baru
- [ ] Kalender hari libur tahun berikutnya
- [ ] Pegawai baru masuk, pensiun, atau pindah unit

### 18.8 Yang memang memerlukan perubahan kode — dan itu wajar

Jujur soal batasnya. Hal berikut tidak bisa dibuat serba-data tanpa membangun bahasa pemrograman sendiri, dan itu bukan tujuan yang sehat:

- Jenis **entitas baru** yang belum ada konsepnya (misal aturan baru memperkenalkan "mediasi wajib" sebagai tahap dengan data sendiri)
- Bentuk **alur yang berbeda secara mendasar** (misal keputusan kolegial oleh majelis dengan pemungutan suara)
- Integrasi sistem luar yang baru

Untuk ini, yang dijamin adalah: **data lama tetap utuh dan tidak perlu dirombak.** Penambahan dilakukan dengan migrasi yang hanya menambah tabel dan kolom (`ADD COLUMN ... NULL`, `CREATE TABLE`), tidak pernah menghapus atau mengubah tipe kolom yang sudah terisi. Tulis aturan ini di `README.md` sebagai pantangan permanen proyek.

### 18.9 Pengaman tambahan

- **Uji regresi hukum.** Simpan sekurangnya 3 kasus contoh per peraturan sebagai fixture beserta hasil yang benar. Setiap kali katalog aturan disunting, jalankan ulang seluruh fixture dan tampilkan peringatan kalau ada hasil yang berubah. Ini jaring pengaman supaya suntingan katalog tidak diam-diam merusak perhitungan.
- **Ekspor penuh satu tombol.** Menghasilkan arsip berisi seluruh tabel dalam JSON ditambah seluruh berkas. Data tidak boleh tersandera aplikasi — kalau suatu hari SIMPEL diganti, isinya harus bisa pindah.
- **Jejak versi definisi.** Setiap perubahan katalog aturan tercatat di `audit_log` lengkap dengan nilai sebelum dan sesudah, siapa yang mengubah, dan alasannya (kolom alasan wajib diisi).
- **Dokumentasi hidup.** Satu halaman di dalam aplikasi, `/pengaturan/regulasi/[id]/ringkasan`, yang menampilkan seluruh aturan terbaca manusia: tingkat, jenis, ambang, tenggat, kewenangan — dicetak dari tabel. Ini sekaligus jadi alat verifikasi bagi bagian hukum.

---

## 19. Catatan penutup untuk Claude Code

Prioritas jika waktu terbatas: **Tahap 5 (informasi + arsip) dan Tahap 7 (template) adalah yang paling mendesak bagi pemilik produk.** Yang pertama menghentikan kehilangan data, yang kedua menghentikan salin-tempel. Tahap lain boleh menyusul.

Tetapi **§18 bukan prioritas yang bisa ditunda.** Dia bukan fitur, dia bentuk basis data. Menambahkannya belakangan berarti membongkar seluruh isi — persis hal yang diminta untuk tidak pernah terjadi. Kerjakan §18.2 bersamaan dengan Tahap 3, sebelum ada satu baris data pun masuk.

Jangan menyederhanakan mesin aturan di §4. Kalau ada yang tidak jelas, tanyakan — menebak di bagian ini menghasilkan dokumen yang cacat hukum, dan itu lebih buruk daripada tidak ada sistem sama sekali.