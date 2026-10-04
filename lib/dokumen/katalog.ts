// Katalog placeholder bawaan (PRD §7.4). Ini DATA AWAL: disalin ke tabel
// template_placeholder saat seed. Admin dapat menambah placeholder baru lewat
// layar Pengaturan (sumber "manual" atau "pengaturan:<kunci>") tanpa programmer.
//
// `sumber: "bawaan"` berarti nilainya dihitung oleh lib/dokumen/konteks.ts dari
// data kasus. Kode di sana hanya merangkai data — tidak memuat aturan hukum.

export type PlaceholderDef = {
  kode: string;
  label: string;
  kelompok: string;
  jenis?: "teks" | "loop";
  sumber?: string;
  contoh?: string;
  deskripsi?: string;
  field?: { kode: string; label: string }[];
};

export const KATALOG_PLACEHOLDER: PlaceholderDef[] = [
  // Instansi (diambil dari Pengaturan)
  { kode: "nama_kementerian", label: "Nama kementerian (kop)", kelompok: "Instansi", sumber: "pengaturan:nama_kementerian", contoh: "KEMENTERIAN PENDIDIKAN TINGGI, SAINS, DAN TEKNOLOGI" },
  { kode: "nama_instansi", label: "Nama instansi", kelompok: "Instansi", sumber: "pengaturan:nama_instansi", contoh: "UNIVERSITAS NEGERI MALANG" },
  { kode: "alamat_instansi", label: "Alamat instansi", kelompok: "Instansi", sumber: "pengaturan:alamat_instansi", contoh: "Jalan Semarang 5, Malang 65145" },
  { kode: "kontak_instansi", label: "Telepon & laman instansi", kelompok: "Instansi", sumber: "pengaturan:kontak_instansi", contoh: "Telepon (0341) 551312 · Laman www.um.ac.id" },

  // Terperiksa
  { kode: "nama_terperiksa", label: "Nama terperiksa (dengan gelar)", kelompok: "Terperiksa", contoh: "Dr. Budi Santoso, M.Pd." },
  { kode: "nama_terperiksa_tanpa_gelar", label: "Nama terperiksa (tanpa gelar)", kelompok: "Terperiksa", contoh: "Budi Santoso" },
  { kode: "nip_terperiksa", label: "NIP terperiksa", kelompok: "Terperiksa", contoh: "198001012005011001" },
  { kode: "pangkat_terperiksa", label: "Pangkat terperiksa", kelompok: "Terperiksa", contoh: "Penata Tingkat I" },
  { kode: "golongan_terperiksa", label: "Golongan ruang terperiksa", kelompok: "Terperiksa", contoh: "III/d" },
  { kode: "pangkat_golongan_terperiksa", label: "Pangkat, golongan terperiksa", kelompok: "Terperiksa", contoh: "Penata Tingkat I, III/d" },
  { kode: "jabatan_terperiksa", label: "Jabatan terperiksa", kelompok: "Terperiksa", contoh: "Lektor" },
  { kode: "unit_kerja_terperiksa", label: "Unit kerja terperiksa", kelompok: "Terperiksa", contoh: "Departemen Pendidikan Luar Sekolah" },
  { kode: "fakultas_terperiksa", label: "Fakultas/direktorat terperiksa", kelompok: "Terperiksa", contoh: "Fakultas Ilmu Pendidikan" },
  { kode: "status_pegawai_terperiksa", label: "Status pegawai terperiksa", kelompok: "Terperiksa", contoh: "PNS" },
  { kode: "tempat_lahir_terperiksa", label: "Tempat lahir terperiksa", kelompok: "Terperiksa", contoh: "Malang" },
  { kode: "tanggal_lahir_terperiksa", label: "Tanggal lahir terperiksa", kelompok: "Terperiksa", contoh: "1 Januari 1980" },

  // Kasus
  { kode: "nomor_registrasi", label: "Nomor registrasi SIMPEL", kelompok: "Kasus", contoh: "SIMPEL/HD/2026/0007" },
  { kode: "judul_kasus", label: "Judul kasus", kelompok: "Kasus", contoh: "Dugaan tidak masuk kerja tanpa alasan sah" },
  { kode: "uraian_dugaan", label: "Uraian dugaan pelanggaran", kelompok: "Kasus" },
  { kode: "pasal_dilanggar", label: "Pasal yang dilanggar (terangkai)", kelompok: "Kasus", contoh: "Pasal 5 huruf f dan Pasal 6 huruf j", deskripsi: "Dirangkai otomatis dari katalog pasal peraturan kasus ini — tidak pernah lintas peraturan." },
  { kode: "nama_regulasi", label: "Nama lengkap peraturan", kelompok: "Kasus", contoh: "Peraturan Pemerintah Nomor 94 Tahun 2021 tentang Disiplin Pegawai Negeri Sipil" },
  { kode: "nama_regulasi_singkat", label: "Nama singkat peraturan", kelompok: "Kasus", contoh: "PP 94/2021" },
  { kode: "tingkat_hukuman", label: "Tingkat hukuman", kelompok: "Kasus", contoh: "ringan" },
  { kode: "jenis_hukuman", label: "Jenis hukuman", kelompok: "Kasus", contoh: "teguran tertulis" },
  { kode: "dampak_perbuatan", label: "Dampak perbuatan", kelompok: "Kasus", contoh: "unit kerja" },
  { kode: "faktor_memberatkan", label: "Faktor memberatkan", kelompok: "Kasus", sumber: "manual" },
  { kode: "faktor_meringankan", label: "Faktor meringankan", kelompok: "Kasus", sumber: "manual" },
  { kode: "waktu_perbuatan", label: "Waktu perbuatan", kelompok: "Kasus" },
  { kode: "tempat_perbuatan", label: "Tempat perbuatan", kelompok: "Kasus" },
  { kode: "kronologi", label: "Kronologi / ringkasan kasus", kelompok: "Kasus" },
  { kode: "pemotongan_ik_teks", label: "Keterangan pemotongan insentif kinerja", kelompok: "Kasus", contoh: "disertai pemotongan insentif kinerja sesuai Peraturan Rektor tentang Insentif Kinerja" },
  {
    kode: "pelanggaran", label: "Daftar pelanggaran (loop)", kelompok: "Kasus", jenis: "loop",
    field: [
      { kode: "nomor", label: "Nomor" }, { kode: "pasal", label: "Pasal" }, { kode: "teks_pasal", label: "Bunyi pasal" },
      { kode: "uraian", label: "Uraian perbuatan" }, { kode: "dampak", label: "Dampak" }, { kode: "waktu", label: "Waktu" }, { kode: "tempat", label: "Tempat" },
    ],
  },

  // Surat
  { kode: "nomor_surat", label: "Nomor surat", kelompok: "Surat", sumber: "manual" },
  { kode: "tanggal_surat", label: "Tanggal surat (angka)", kelompok: "Surat", contoh: "04-10-2026" },
  { kode: "tanggal_surat_panjang", label: "Tanggal surat (panjang)", kelompok: "Surat", contoh: "4 Oktober 2026" },
  { kode: "tempat_surat", label: "Tempat surat", kelompok: "Surat", sumber: "pengaturan:tempat_surat", contoh: "Malang" },
  { kode: "sifat_surat", label: "Sifat surat", kelompok: "Surat", contoh: "Rahasia" },
  { kode: "hal_surat", label: "Hal surat", kelompok: "Surat", sumber: "manual" },
  { kode: "lampiran_surat", label: "Lampiran surat", kelompok: "Surat", contoh: "-" },
  { kode: "tahun_surat", label: "Tahun surat", kelompok: "Surat", contoh: "2026" },

  // Pemeriksaan
  { kode: "hari_pemeriksaan", label: "Hari pemeriksaan", kelompok: "Pemeriksaan", contoh: "Senin" },
  { kode: "tanggal_pemeriksaan", label: "Tanggal pemeriksaan", kelompok: "Pemeriksaan", contoh: "12 Oktober 2026" },
  { kode: "tanggal_pemeriksaan_terbilang", label: "Tanggal pemeriksaan (terbilang)", kelompok: "Pemeriksaan", contoh: "tanggal dua belas bulan Oktober tahun dua ribu dua puluh enam" },
  { kode: "jam_pemeriksaan", label: "Jam pemeriksaan", kelompok: "Pemeriksaan", contoh: "09.00 WIB" },
  { kode: "jam_selesai_pemeriksaan", label: "Jam selesai pemeriksaan", kelompok: "Pemeriksaan", contoh: "11.30 WIB" },
  { kode: "tempat_pemeriksaan", label: "Tempat pemeriksaan", kelompok: "Pemeriksaan", contoh: "Ruang Rapat Direktorat SDM, Gedung A3" },
  { kode: "urutan_panggilan", label: "Panggilan ke (I/II)", kelompok: "Pemeriksaan", contoh: "I" },
  { kode: "nomor_panggilan_1", label: "Nomor Surat Panggilan I", kelompok: "Pemeriksaan" },
  { kode: "tanggal_panggilan_1", label: "Tanggal Surat Panggilan I", kelompok: "Pemeriksaan" },
  { kode: "nomor_panggilan_2", label: "Nomor Surat Panggilan II", kelompok: "Pemeriksaan" },
  { kode: "tanggal_panggilan_2", label: "Tanggal Surat Panggilan II", kelompok: "Pemeriksaan" },
  { kode: "catatan_perekaman", label: "Catatan perekaman/penolakan rekam", kelompok: "Pemeriksaan", contoh: "Terperiksa tidak menyetujui perekaman; pemeriksaan dilanjutkan tanpa rekaman." },

  // Tim pemeriksa
  { kode: "nomor_sk_tim", label: "Nomor SK Tim Pemeriksa", kelompok: "Tim pemeriksa" },
  { kode: "tanggal_sk_tim", label: "Tanggal SK Tim Pemeriksa", kelompok: "Tim pemeriksa" },
  { kode: "pejabat_pembentuk_tim", label: "Pejabat pembentuk Tim", kelompok: "Tim pemeriksa", contoh: "Rektor" },
  { kode: "nama_ketua_tim", label: "Nama ketua tim", kelompok: "Tim pemeriksa" },
  { kode: "nip_ketua_tim", label: "NIP ketua tim", kelompok: "Tim pemeriksa" },
  { kode: "nama_sekretaris_tim", label: "Nama sekretaris tim", kelompok: "Tim pemeriksa" },
  { kode: "nip_sekretaris_tim", label: "NIP sekretaris tim", kelompok: "Tim pemeriksa" },
  {
    kode: "anggota_tim", label: "Anggota tim pemeriksa (loop)", kelompok: "Tim pemeriksa", jenis: "loop",
    field: [
      { kode: "nomor", label: "Nomor" }, { kode: "nama", label: "Nama" }, { kode: "nip", label: "NIP" }, { kode: "pangkat", label: "Pangkat/golongan" },
      { kode: "jabatan", label: "Jabatan" }, { kode: "unit_kerja", label: "Unit kerja" }, { kode: "unsur", label: "Unsur" }, { kode: "jabatan_dalam_tim", label: "Jabatan dalam tim" },
    ],
  },

  // Tanya jawab
  {
    kode: "qa", label: "Tanya jawab BAP (loop)", kelompok: "Tanya jawab", jenis: "loop",
    field: [{ kode: "nomor", label: "Nomor" }, { kode: "pertanyaan", label: "Pertanyaan" }, { kode: "jawaban", label: "Jawaban" }],
  },

  // Pejabat
  { kode: "nama_pejabat_penjatuh", label: "Nama pejabat penjatuh", kelompok: "Pejabat", sumber: "manual" },
  { kode: "nip_pejabat_penjatuh", label: "NIP pejabat penjatuh", kelompok: "Pejabat", sumber: "manual" },
  { kode: "jabatan_pejabat_penjatuh", label: "Jabatan pejabat penjatuh", kelompok: "Pejabat", contoh: "Rektor" },
  { kode: "nama_atasan_langsung", label: "Nama atasan langsung", kelompok: "Pejabat" },
  { kode: "nip_atasan_langsung", label: "NIP atasan langsung", kelompok: "Pejabat" },
  { kode: "jabatan_atasan_langsung", label: "Jabatan atasan langsung", kelompok: "Pejabat" },
  { kode: "nama_rektor", label: "Nama Rektor", kelompok: "Pejabat", sumber: "pengaturan:nama_rektor" },
  { kode: "nip_rektor", label: "NIP Rektor", kelompok: "Pejabat", sumber: "pengaturan:nip_rektor" },

  // SK
  { kode: "nomor_sk", label: "Nomor SK hukuman disiplin", kelompok: "SK" },
  { kode: "tanggal_sk", label: "Tanggal SK", kelompok: "SK" },
  { kode: "tanggal_diterima", label: "Tanggal SK diterima pegawai", kelompok: "SK" },
  { kode: "tanggal_mulai_berlaku", label: "Tanggal mulai berlaku", kelompok: "SK" },
  { kode: "tanggal_selesai_hukuman", label: "Tanggal selesai hukuman", kelompok: "SK" },
  { kode: "durasi_hukuman", label: "Masa hukuman", kelompok: "SK", contoh: "12 (dua belas) bulan" },
  { kode: "menimbang", label: "Konsideran menimbang (loop)", kelompok: "SK", jenis: "loop", field: [{ kode: "huruf", label: "Huruf" }, { kode: "teks", label: "Teks" }] },
  { kode: "mengingat", label: "Konsideran mengingat (loop)", kelompok: "SK", jenis: "loop", field: [{ kode: "nomor", label: "Nomor" }, { kode: "teks", label: "Teks" }] },

  // Rekap kehadiran
  {
    kode: "rekap_tmk", label: "Rekapitulasi ketidakhadiran (loop)", kelompok: "Kehadiran", jenis: "loop",
    field: [
      { kode: "tahun", label: "Tahun" }, { kode: "jan", label: "Jan" }, { kode: "feb", label: "Feb" }, { kode: "mar", label: "Mar" },
      { kode: "apr", label: "Apr" }, { kode: "mei", label: "Mei" }, { kode: "jun", label: "Jun" }, { kode: "jul", label: "Jul" },
      { kode: "agu", label: "Agu" }, { kode: "sep", label: "Sep" }, { kode: "okt", label: "Okt" }, { kode: "nov", label: "Nov" },
      { kode: "des", label: "Des" }, { kode: "jumlah", label: "Jumlah" },
    ],
  },
  { kode: "jumlah_tmk", label: "Jumlah hari TMK tahun berjalan", kelompok: "Kehadiran", contoh: "15" },

  // Lain-lain
  { kode: "nama_pengunduh", label: "Nama pembuat dokumen", kelompok: "Lain-lain" },
  { kode: "tanggal_hari_ini", label: "Tanggal hari ini", kelompok: "Lain-lain", contoh: "4 Oktober 2026" },
];

// Daftar template awal (PRD §7.5) — kode berkas di templates-sumber/.
export const TEMPLATE_AWAL = [
  { kode: "surat_panggilan", nama: "Surat Panggilan I / II", jenis: "surat_panggilan", rezim: [], tahap: ["panggilan_1", "panggilan_2"] },
  { kode: "bap", nama: "Berita Acara Pemeriksaan", jenis: "bap", rezim: [], tahap: ["pemeriksaan", "bap"] },
  { kode: "bap_tidak_hadir", nama: "Berita Acara Ketidakhadiran Pemeriksaan", jenis: "bap_tidak_hadir", rezim: [], tahap: ["pemeriksaan", "bap", "panggilan_2"] },
  { kode: "sk_tim_pemeriksa", nama: "Keputusan Pembentukan Tim Pemeriksa", jenis: "sk_tim_pemeriksa", rezim: [], tahap: ["pembentukan_tim"] },
  { kode: "surat_tugas_sekretariat", nama: "Surat Tugas Tim Sekretariat", jenis: "surat_tugas_sekretariat", rezim: ["A"], tahap: ["surat_tugas_sekretariat", "pembentukan_tim"] },
  { kode: "lhp", nama: "Laporan Hasil Pemeriksaan", jenis: "lhp", rezim: [], tahap: ["lhp"] },
  { kode: "lhp_tidak_hadir", nama: "Laporan Hasil Pemeriksaan (terperiksa tidak hadir)", jenis: "lhp_tidak_hadir", rezim: [], tahap: ["lhp"] },
  { kode: "nota_dinas_kewenangan", nama: "Nota Dinas Laporan Kewenangan", jenis: "nota_dinas_kewenangan", rezim: ["A"], tahap: ["nota_dinas_kewenangan"] },
  { kode: "usul_menteri", nama: "Surat Usul Penjatuhan Hukuman Disiplin kepada Menteri", jenis: "usul_menteri", rezim: ["A"], tahap: ["usul_menteri"] },
  { kode: "rekapitulasi_tmk", nama: "Rekapitulasi Ketidakhadiran Kerja", jenis: "rekapitulasi_tmk", rezim: [], tahap: ["telaah"] },
  { kode: "keterangan_rekan_sejawat", nama: "Surat Keterangan Kesaksian Rekan Sejawat", jenis: "keterangan_rekan_sejawat", rezim: [], tahap: ["telaah", "pemeriksaan"] },
  { kode: "kronologi", nama: "Kronologi", jenis: "kronologi", rezim: [], tahap: ["telaah"] },
  { kode: "sk_hukdis", nama: "Keputusan Penjatuhan Hukuman Disiplin", jenis: "sk_hukdis", rezim: [], tahap: ["penetapan_sk"] },
  { kode: "panggilan_penerimaan_sk", nama: "Surat Panggilan Penerimaan Keputusan Hukuman Disiplin", jenis: "panggilan_penerimaan_sk", rezim: ["B"], tahap: ["penyampaian_sk"] },
  { kode: "sk_pembebasan_sementara", nama: "Keputusan Pembebasan Sementara dari Tugas Jabatan", jenis: "sk_pembebasan_sementara", rezim: [], tahap: [] },
  { kode: "lapor_sekjen", nama: "Surat Pelaporan Salinan SK Tim Pemeriksa kepada Sekretaris Jenderal", jenis: "lapor_sekjen", rezim: ["A"], tahap: ["lapor_sekjen"] },
  { kode: "persetujuan_rekam", nama: "Surat Persetujuan Perekaman Pemeriksaan", jenis: "persetujuan_rekam", rezim: [], tahap: ["pemeriksaan"] },
] as const;
