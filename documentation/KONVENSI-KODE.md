# Konvensi Kode SIMPEL

Pegangan bagi siapa pun (manusia atau AI) yang menambah fitur. Baca `app_summary.md` §18 lebih dulu.

## 1. Pantangan permanen

1. **Aturan hukum adalah data, bukan kode.** Angka ambang, tenggat, nama jenis hukuman, kode peraturan, matriks kewenangan — semuanya dibaca dari tabel katalog (`regulasi`, `tingkat_hukuman`, `jenis_hukuman`, `pasal_regulasi`, `ambang_kehadiran`, `aturan_*`). `lib/hukdis/` diuji otomatis agar tidak memuat angka selain 0/1, kode peraturan, atau nama jenis hukuman (`tests/tanpa-konstanta-hukum.test.ts`).
2. **Riwayat tidak boleh berubah.** Kasus menyimpan `snapshot_regulasi`, `snapshot_pegawai`; pelanggaran menyimpan `snapshot_pasal`; hukuman menyimpan `snapshot_jenis_hukuman`; dokumen menyimpan `snapshot_data` + `template_versi_id`. Tampilkan data riwayat dari snapshot, bukan dari katalog terkini.
3. **Katalog bersifat tambah.** Trigger basis data menolak UPDATE substantif/DELETE pada katalog yang sudah dipakai kasus. Perubahan = baris baru (versi naik, `berlaku_sampai`, `digantikan_oleh_id`) atau "koreksi salah ketik" dengan alasan: panggil `izinkanKoreksi(tx)` di dalam transaksi lalu `catatAudit(... aksi: "koreksi", alasan)`.
4. **Migrasi hanya menambah.** Berkas baru `supabase/migrations/000N_nama.sql`: `CREATE TABLE`, `ADD COLUMN ... NULL`, `CREATE INDEX`. Tidak pernah `DROP TABLE/COLUMN` atau mengubah tipe. Runner (`npm run db:migrate`) menolak berkas yang melanggar dan otomatis menyalakan RLS di tabel baru.
5. **Tidak ada penghapusan permanen dari antarmuka biasa.** Hapus = arsipkan (`diarsipkan_pada`) dengan alasan tertulis.
6. **Kode proses baku** (bentuk proses yang stabil lintas peraturan, boleh disebut di kode): kelas entri `informasi|non_hukdis|arsip|hukdis`; kode tahap `telaah, pembentukan_tim, lapor_sekjen, panggilan_1, panggilan_2, pemeriksaan, bap, lhp, nota_dinas_kewenangan, usul_menteri, penetapan_sk, penyampaian_sk, pengiriman_sk, berlaku, menjalani, selesai`; status `upaya_administratif, dihentikan, selesai`; alur khusus `penghentian_gaji`. Peraturan baru sebaiknya memakai ulang kode tahap ini.

## 2. Struktur

```
app/(app)/<modul>/           halaman (Server Components) + _aksi.ts ("use server") + komponen klien *_klien.tsx
app/api/                     route handler (unduhan, pencarian, cron)
components/ui/               shadcn/ui (ukuran sudah diperbesar: tombol/input 44px)
components/simpel/           komponen bersama SIMPEL (lihat §5)
components/shell/            kerangka aplikasi (sidebar, header, menu ponsel)
lib/db.ts                    sql (postgres.js), transaksi(), izinkanKoreksi()
lib/auth/                    wajibMasuk(), wajibHak(), wajibHalamanHak(), penggunaSaatIni()
lib/audit.ts                 catatAudit(pengguna, {...})
lib/galat.ts                 GalatPengguna, jalankan(), Hasil<T>
lib/regulasi/                SATU-SATUNYA pintu ke tabel regulasi: resolveRegulasi, muatAturan, muatKalender, eksporDefinisi, simpanDefinisi
lib/hukdis/                  mesin aturan generik (murni, tanpa konstanta hukum)
lib/hari-kerja/              kalkulator hari kerja
lib/kasus.ts                 pratinjauKasus, buatKasus, tambahPelanggaran, segarkanTenggat, selesaikanTahap, gantiTingkat, catatHukuman
lib/entri.ts                 nomorRegistrasi, ambilPegawai, snapshotPegawai, konteksPegawai, peringkatGolongan, ringkasEntri
lib/penyimpanan.ts           Supabase Storage bucket privat: unggahBerkas, unduhBerkas, urlTertanda (≤5 menit), urlUnggahTertanda
lib/pengaturan.ts            pengaturan(kunci, bawaan), referensi(kategori), daftarStatusKasus()
lib/format.ts                tanggalPanjang, tanggalPendek, namaHari, terbilang, tanggalTerbilang, durasiBulan, waktuPendek, labelKode
lib/tenggat.ts               statusTenggat() → warna hijau/kuning/merah
lib/dokumen/                 katalog placeholder, template (pindai/isi docx)
```

## 3. Basis data

- `import { sql, transaksi, type Sql } from "@/lib/db"`. Tagged template postgres.js (`sql\`select ... where id = ${id}\``) — aman dari injeksi. Fragmen: `sql\`\``, `sql(obj)` untuk insert, `sql.json(v)` untuk jsonb, `sql(array)` untuk `in`.
- Kolom `date` dibaca sebagai teks `"YYYY-MM-DD"`. `timestamptz` sebagai `Date`.
- Semua akses data lewat server. Jangan pernah mengirim kunci rahasia ke peramban. Tidak ada klien Supabase di sisi peramban (kecuali PUT ke signed upload URL).

## 4. Hak akses & audit

- Halaman: `const p = await wajibMasuk();` (admin: `await wajibHalamanHak("kelola_pengaturan")`).
- Aksi server: `const p = await wajibHak("boleh_buat" | "boleh_ubah" | "boleh_ubah_status" | "boleh_arsipkan" | "kelola_pengaturan" | "boleh_musnahkan")`.
- **Membuka detail kasus/entri wajib mencatat audit `aksi: "lihat"`.** Setiap buat/ubah/arsipkan/unduh/cetak/ekspor juga dicatat. Perubahan katalog aturan mencatat nilai sebelum & sesudah (`selisih(lama, baru)`) dan alasan.

## 5. Antarmuka

- Bahasa Indonesia seluruhnya, istilah hukum persis peraturan ("hukuman disiplin", bukan "sanksi"; "Berita Acara Pemeriksaan"). Pesan galat tanpa istilah teknis — lempar `new GalatPengguna("...")`; galat lain otomatis jadi "Gagal menyimpan. Periksa sambungan internet…".
- Aksi server mengembalikan `Hasil<T>` lewat `jalankan(async () => {...}, "Pesan sukses")`. Di klien: `const { jalankan, sibuk } = useAksi(); jalankan(() => aksi(x), { sukses?, lalu? })`.
- Komponen bersama (`components/simpel/`): `JudulHalaman`, `Panel`, `Kosong`, `Pii`, `Rincian`, `Catatan`, `LencanaStatus`, `LencanaTenggat`, `LencanaVerifikasi`, `LencanaRezim`, `Lencana`, `TombolKirim`, `useAksi`, `DialogAlasan`, `BantuanPasal`, `PilihPegawai`, `UnggahBerkas`, `unggahLangsung`.
- **Responsif 390px tanpa gulir mendatar.** Tabel lebar: tampilkan sebagai kartu di `< md` (`md:hidden` / `hidden md:table`) atau bungkus dalam `<div className="overflow-x-auto rounded-lg border">` (gulir hanya di dalam kotak itu). Formulir satu kolom di ponsel.
- Teks isi ≥ 15px (`text-sm` = 15px, `text-xs` = 13px hanya untuk lencana/keterangan). Target sentuh ≥ 44px (komponen ui sudah).
- Nama & NIP pegawai dibungkus `<Pii>` (mode privasi).
- Warna status: `aman` (hijau), `waspada` (kuning), `lewat` (merah), `arsip` (abu), `info` (biru) — kelas Tailwind `bg-aman-muda text-aman`, dst.
- Latar halaman sudah berpola logo UM; konten diletakkan di `Panel`/kartu ber-latar `bg-card`.
- Alur berbasis tahapan, bukan formulir raksasa; simpan otomatis di formulir panjang.

## 6. Penamaan

Bahasa Indonesia untuk nama domain (tabel, fungsi, variabel): `buatKasus`, `daftarBerkas`, `tanggalRealisasi`. Istilah teknis umum boleh Inggris (`props`, `route`).
