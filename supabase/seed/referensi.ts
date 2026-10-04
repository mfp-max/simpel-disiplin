// DATA AWAL referensi umum. Semua dapat disunting lewat layar Pengaturan.

export const PERAN = [
  { kode: "admin", nama: "Admin", urutan: 1, boleh_buat: true, boleh_ubah: true, boleh_ubah_status: true, boleh_arsipkan: true, kelola_pengaturan: true, boleh_musnahkan: true, boleh_lihat_audit: true, keterangan: "Semua hak + kelola pengguna, template, master data, dan penghapusan." },
  { kode: "direktur", nama: "Direktur", urutan: 2, boleh_buat: false, boleh_ubah: false, boleh_ubah_status: true, boleh_arsipkan: false, kelola_pengaturan: false, boleh_musnahkan: false, boleh_lihat_audit: true, keterangan: "Lihat semua; ubah status kasus; tidak menghapus; akses penuh dashboard monev." },
  { kode: "kasubdit", nama: "Kasubdit", urutan: 3, boleh_buat: true, boleh_ubah: true, boleh_ubah_status: true, boleh_arsipkan: false, kelola_pengaturan: false, boleh_musnahkan: false, boleh_lihat_audit: true, keterangan: "Lihat semua; ubah semua kasus; tidak menghapus." },
  { kode: "kasi", nama: "Kasi", urutan: 4, boleh_buat: true, boleh_ubah: true, boleh_ubah_status: true, boleh_arsipkan: false, kelola_pengaturan: false, boleh_musnahkan: false, boleh_lihat_audit: false, keterangan: "Lihat semua; buat dan ubah kasus; unggah berkas; buat dokumen." },
];

export const REZIM = [
  { kode: "A", nama: "ASN (PNS/CPNS)", urutan: 1, keterangan: "PP 94/2021, PerBKN 6/2022, Kepmendiktisaintek 84/M/KEP/2025, PP 10/1983 jo. PP 45/1990" },
  { kode: "B", nama: "Pegawai yang diangkat Rektor", urutan: 2, keterangan: "Dosen tetap & tendik tetap non-ASN, termasuk Calon Pegawai — Peraturan Rektor UM 70/2026" },
];

// Pemetaan kolom "Status Pegawai" Simpega → rezim. null = perlu verifikasi manual.
export const PEMETAAN_STATUS = [
  { status_pegawai: "PNS", rezim_kode: "A", keterangan: "Pegawai Negeri Sipil" },
  { status_pegawai: "CPNS", rezim_kode: "A", keterangan: "Calon Pegawai Negeri Sipil" },
  { status_pegawai: "PTNA", rezim_kode: "B", keterangan: "Pegawai tetap non-ASN yang diangkat Rektor" },
  { status_pegawai: "CPTNA", rezim_kode: "B", keterangan: "Calon pegawai tetap non-ASN" },
  { status_pegawai: "PPPK", rezim_kode: null, keterangan: "ASN PPPK — tidak tunduk PP 94/2021 maupun Pertor 70/2026; perlu penetapan dasar hukum." },
  { status_pegawai: "PTT", rezim_kode: null, keterangan: "Pegawai tidak tetap — perlu verifikasi" },
  { status_pegawai: "AP", rezim_kode: null, keterangan: "Perlu verifikasi" },
  { status_pegawai: "Praktisi", rezim_kode: null, keterangan: "Perlu verifikasi" },
  { status_pegawai: "Akademisi Luar UM", rezim_kode: null, keterangan: "Bukan pegawai UM — perlu verifikasi manual" },
];

export const KELAS_ENTRI = [
  { kode: "informasi", nama: "Registrasi Informasi", prefix: "INF", hitung_sla: false, urutan: 1, keterangan: "Belum menjadi perkara; tidak dihitung dalam progres, SLA, maupun statistik." },
  { kode: "hukdis", nama: "Kasus Hukuman Disiplin", prefix: "HD", hitung_sla: true, urutan: 2, keterangan: "Kasus aktif yang mengikuti tahapan penuh." },
  { kode: "non_hukdis", nama: "Pembinaan (non-hukdis)", prefix: "NH", hitung_sla: false, urutan: 3, keterangan: "Teguran pembinaan, kode etik, konseling — tanpa tahapan formal dan tanpa SK hukuman disiplin." },
  { kode: "arsip", nama: "Arsip Kasus Lampau", prefix: "AR", hitung_sla: false, urutan: 4, keterangan: "Kasus selesai sebelum SIMPEL ada; berkas boleh tidak lengkap." },
];

export const STATUS_KASUS = [
  { kode: "informasi", nama: "Informasi", urutan: 1, kelompok: "informasi", warna: "slate" },
  { kode: "dinaikkan", nama: "Sudah dinaikkan jadi kasus", urutan: 2, kelompok: "informasi", warna: "slate" },
  { kode: "tercatat", nama: "Tercatat", urutan: 3, kelompok: "selesai", warna: "slate" },
  { kode: "telaah", nama: "Telaah", urutan: 10, kelompok: "berjalan", warna: "sky" },
  { kode: "pemeriksaan", nama: "Pemeriksaan", urutan: 20, kelompok: "berjalan", warna: "indigo" },
  { kode: "penjatuhan", nama: "Penjatuhan", urutan: 30, kelompok: "berjalan", warna: "violet" },
  { kode: "penyampaian", nama: "Penyampaian", urutan: 40, kelompok: "berjalan", warna: "fuchsia" },
  { kode: "berlaku", nama: "Berlaku", urutan: 50, kelompok: "berjalan", warna: "amber" },
  { kode: "menjalani", nama: "Menjalani hukuman", urutan: 60, kelompok: "berjalan", warna: "orange" },
  { kode: "upaya_administratif", nama: "Upaya administratif", urutan: 65, kelompok: "berjalan", warna: "rose" },
  { kode: "selesai", nama: "Selesai", urutan: 90, kelompok: "selesai", warna: "emerald" },
  { kode: "dihentikan", nama: "Dihentikan", urutan: 95, kelompok: "dihentikan", warna: "zinc" },
];

const ref = (kategori: string, items: [string, string][]) => items.map(([kode, label], i) => ({ kategori, kode, label, urutan: i + 1 }));

export const KODE_REFERENSI = [
  ...ref("sumber_informasi", [["surat", "Surat masuk"], ["laporan_lisan", "Laporan lisan"], ["disposisi", "Disposisi pimpinan"], ["temuan_spi", "Temuan SPI"], ["presensi", "Data presensi"], ["lainnya", "Lainnya"]]),
  ...ref("dampak", [["unit_kerja", "Unit kerja"], ["instansi", "Instansi"], ["negara", "Pemerintah dan/atau negara"]]),
  ...ref("kategori_berkas", [["bukti", "Bukti"], ["pindaian_arsip", "Pindaian arsip"], ["rekaman", "Rekaman"], ["persetujuan_rekam", "Surat persetujuan perekaman"], ["dokumen_terbit", "Dokumen terbit (ditandatangani)"], ["lainnya", "Lainnya"]]),
  ...ref("jenis_non_hukdis", [["teguran_pembinaan", "Teguran pembinaan"], ["kode_etik", "Pelanggaran kode etik"], ["konseling", "Konseling"], ["peringatan_lisan_atasan", "Peringatan lisan atasan"], ["lainnya", "Lainnya"]]),
  ...ref("alasan_penghentian", [["tidak_terbukti", "Tidak terbukti"], ["kedaluwarsa", "Kedaluwarsa"], ["pegawai_berhenti", "Pegawai berhenti/pensiun"], ["meninggal", "Pegawai meninggal dunia"], ["lainnya", "Lainnya"]]),
  ...ref("kelengkapan_berkas", [["lengkap", "Lengkap"], ["sebagian", "Sebagian"], ["minim", "Minim"]]),
  ...ref("unsur_tim", [["atasan_langsung", "Atasan langsung"], ["pengawasan", "Unsur pengawasan (mis. SPI)"], ["kepegawaian", "Unsur kepegawaian"], ["lain", "Lainnya"]]),
  ...ref("jabatan_dalam_tim", [["ketua", "Ketua merangkap anggota"], ["sekretaris", "Sekretaris merangkap anggota"], ["anggota", "Anggota"]]),
  ...ref("jenis_tim", [["atasan_langsung", "Atasan langsung"], ["unit_kerja", "Tim Pemeriksa unit kerja"], ["um", "Tim Pemeriksa UM"]]),
  ...ref("jenis_upaya", [["keberatan", "Keberatan"], ["banding", "Banding administratif"]]),
  ...ref("hasil_upaya", [["dikuatkan", "Dikuatkan"], ["diperingan", "Diperingan"], ["diperberat", "Diperberat"], ["dibatalkan", "Dibatalkan"]]),
  ...ref("moda_pemeriksaan", [["tatap_muka", "Tatap muka"], ["virtual", "Virtual"]]),
  ...ref("jenis_unit", [["fakultas", "Fakultas"], ["sekolah", "Sekolah"], ["direktorat", "Direktorat"], ["lembaga", "Lembaga"], ["badan", "Badan"], ["upt", "UPT"], ["sekretariat", "Sekretariat"], ["departemen", "Departemen/Jurusan"], ["prodi", "Program studi"], ["lainnya", "Lainnya"]]),
  ...ref("jenis_dokumen", [
    ["surat_panggilan", "Surat Panggilan"], ["bap", "Berita Acara Pemeriksaan"], ["bap_tidak_hadir", "Berita Acara Ketidakhadiran"],
    ["sk_tim_pemeriksa", "Keputusan Pembentukan Tim Pemeriksa"], ["surat_tugas_sekretariat", "Surat Tugas Tim Sekretariat"], ["lhp", "Laporan Hasil Pemeriksaan"],
    ["lhp_tidak_hadir", "LHP (terperiksa tidak hadir)"], ["nota_dinas_kewenangan", "Nota Dinas Laporan Kewenangan"], ["usul_menteri", "Surat Usul kepada Menteri"],
    ["rekapitulasi_tmk", "Rekapitulasi Ketidakhadiran"], ["keterangan_rekan_sejawat", "Keterangan Rekan Sejawat"], ["kronologi", "Kronologi"],
    ["sk_hukdis", "Keputusan Hukuman Disiplin"], ["panggilan_penerimaan_sk", "Panggilan Penerimaan Keputusan"], ["sk_pembebasan_sementara", "Keputusan Pembebasan Sementara"],
    ["lapor_sekjen", "Laporan Salinan SK Tim ke Sekjen"], ["persetujuan_rekam", "Persetujuan Perekaman"], ["lainnya", "Lainnya"],
  ]),
];

export const GOLONGAN_RUANG = [
  ["I/a", "Juru Muda"], ["I/b", "Juru Muda Tingkat I"], ["I/c", "Juru"], ["I/d", "Juru Tingkat I"],
  ["II/a", "Pengatur Muda"], ["II/b", "Pengatur Muda Tingkat I"], ["II/c", "Pengatur"], ["II/d", "Pengatur Tingkat I"],
  ["III/a", "Penata Muda"], ["III/b", "Penata Muda Tingkat I"], ["III/c", "Penata"], ["III/d", "Penata Tingkat I"],
  ["IV/a", "Pembina"], ["IV/b", "Pembina Tingkat I"], ["IV/c", "Pembina Utama Muda"], ["IV/d", "Pembina Utama Madya"], ["IV/e", "Pembina Utama"],
].map(([kode, pangkat], i) => ({ kode, pangkat, urutan: i + 1 }));

export const PENGATURAN = [
  { kunci: "nama_kementerian", label: "Nama kementerian (kop surat)", kelompok: "instansi", nilai: "KEMENTERIAN PENDIDIKAN TINGGI, SAINS, DAN TEKNOLOGI", urutan: 1 },
  { kunci: "nama_instansi", label: "Nama instansi", kelompok: "instansi", nilai: "UNIVERSITAS NEGERI MALANG", urutan: 2 },
  { kunci: "alamat_instansi", label: "Alamat instansi", kelompok: "instansi", nilai: "Jalan Semarang 5, Malang 65145", urutan: 3 },
  { kunci: "kontak_instansi", label: "Telepon & laman", kelompok: "instansi", nilai: "Telepon (0341) 551312 · Laman www.um.ac.id", urutan: 4 },
  { kunci: "tempat_surat", label: "Tempat penandatanganan surat", kelompok: "instansi", nilai: "Malang", urutan: 5 },
  { kunci: "nama_rektor", label: "Nama Rektor (dengan gelar)", kelompok: "pejabat", nilai: "", urutan: 10, keterangan: "Diisi admin; dipakai di dokumen yang ditandatangani Rektor." },
  { kunci: "nip_rektor", label: "NIP Rektor", kelompok: "pejabat", nilai: "", urutan: 11 },
  { kunci: "ambang_peringatan_tenggat_hari", label: "Peringatan tenggat (hari kerja sebelum jatuh tempo)", kelompok: "sistem", nilai: 3, urutan: 20, keterangan: "Hijau > n hari, kuning 1–n hari, merah lewat." },
  { kunci: "retensi_rekaman_hari", label: "Retensi rekaman audio (hari setelah kasus selesai/dihentikan)", kelompok: "sistem", nilai: 90, urutan: 21 },
  { kunci: "batas_idle_menit", label: "Keluar otomatis setelah tidak aktif (menit)", kelompok: "sistem", nilai: 30, urutan: 22 },
  { kunci: "simpan_otomatis_detik", label: "Interval simpan otomatis mode sidang (detik)", kelompok: "sistem", nilai: 5, urutan: 23 },
  { kunci: "ambang_dekat_kehadiran_hari", label: "Peringatan ambang kehadiran (hari sebelum ambang berikutnya)", kelompok: "sistem", nilai: 2, urutan: 24 },
  { kunci: "sifat_surat", label: "Sifat surat bawaan", kelompok: "instansi", nilai: "Rahasia", urutan: 6 },
  { kunci: "lampiran_surat", label: "Lampiran surat bawaan", kelompok: "instansi", nilai: "-", urutan: 7 },
  { kunci: "teks_pemotongan_ik", label: "Kalimat pemotongan insentif kinerja di dokumen", kelompok: "instansi", nilai: "disertai pemotongan insentif kinerja sesuai Peraturan Rektor tentang Insentif Kinerja", urutan: 8 },
  { kunci: "simpega_api", label: "API Simpega", kelompok: "integrasi", nilai: { aktif: false }, urutan: 30, keterangan: "Belum dikonfigurasi. Endpoint dan kunci diisi lewat variabel lingkungan SIMPEGA_API_URL / SIMPEGA_API_KEY." },
];

export const PERTANYAAN_BAKU = [
  { bagian: "pembuka", urutan: 1, pertanyaan: "Apakah Saudara telah menerima Surat Panggilan untuk menghadiri pemeriksaan hari ini?" },
  { bagian: "pembuka", urutan: 2, pertanyaan: "Apakah Saudara memahami maksud dan tujuan Saudara dipanggil dan diperiksa pada hari ini?" },
  { bagian: "pembuka", urutan: 3, pertanyaan: "Apakah Saudara dalam keadaan sehat jasmani dan rohani serta bersedia untuk diperiksa?" },
  { bagian: "pembuka", urutan: 4, pertanyaan: "Apakah Saudara bersedia memberikan keterangan dengan jujur dan sebenar-benarnya, mengingat sumpah/janji Saudara sebagai Pegawai?" },
  { bagian: "pembuka", urutan: 5, pertanyaan: "Mohon Saudara jelaskan riwayat pekerjaan Saudara sejak diangkat sampai dengan saat ini." },
  { bagian: "pembuka", urutan: 6, pertanyaan: "Hambatan apa saja yang Saudara hadapi dalam melaksanakan tugas?" },
  { bagian: "pembuka", urutan: 7, pertanyaan: "Bagaimana cara Saudara mengatasi hambatan tersebut?" },
  { bagian: "substansi", urutan: 8, pertanyaan: "Apakah Saudara mengetahui kewajiban dan larangan sebagai Pegawai sebagaimana diatur dalam peraturan disiplin yang berlaku?" },
  { bagian: "substansi", urutan: 9, pertanyaan: "Apakah benar Saudara melakukan perbuatan sebagaimana yang diduga? Mohon jelaskan kronologinya." },
  { bagian: "substansi", urutan: 10, pertanyaan: "Kapan dan di mana perbuatan tersebut terjadi?" },
  { bagian: "substansi", urutan: 11, pertanyaan: "Apa alasan atau latar belakang perbuatan tersebut?" },
  { bagian: "substansi", urutan: 12, pertanyaan: "Apakah ada pihak lain yang mengetahui atau terlibat dalam perbuatan tersebut?" },
  { bagian: "penutup", urutan: 13, pertanyaan: "Apakah Saudara menyadari bahwa perbuatan tersebut dapat berimplikasi pada penjatuhan hukuman disiplin?" },
  { bagian: "penutup", urutan: 14, pertanyaan: "Apakah Saudara siap menerima konsekuensi atas perbuatan tersebut sesuai ketentuan peraturan perundang-undangan?" },
  { bagian: "penutup", urutan: 15, pertanyaan: "Apakah ada keterangan tambahan yang ingin Saudara sampaikan? (Pernyataan tambahan dapat disampaikan secara tertulis paling lama 2×24 jam setelah pemeriksaan.)" },
  { bagian: "penutup", urutan: 16, pertanyaan: "Apakah Saudara bersedia diperiksa kembali apabila diperlukan?" },
  { bagian: "penutup", urutan: 17, pertanyaan: "Apakah keterangan yang Saudara berikan hari ini disampaikan tanpa tekanan atau paksaan dari pihak mana pun?" },
];

// Hari libur nasional & cuti bersama — WAJIB dicocokkan dengan SKB 3 Menteri.
const V26 = "Perlu verifikasi terhadap SKB 3 Menteri tahun 2026.";
export const HARI_LIBUR = [
  { tanggal: "2026-01-01", nama: "Tahun Baru 2026 Masehi", jenis: "libur_nasional" },
  { tanggal: "2026-01-16", nama: "Isra Mikraj Nabi Muhammad SAW", jenis: "libur_nasional", keterangan: V26 },
  { tanggal: "2026-02-16", nama: "Cuti bersama Tahun Baru Imlek", jenis: "cuti_bersama", keterangan: V26 },
  { tanggal: "2026-02-17", nama: "Tahun Baru Imlek 2577 Kongzili", jenis: "libur_nasional", keterangan: V26 },
  { tanggal: "2026-03-18", nama: "Cuti bersama Hari Suci Nyepi", jenis: "cuti_bersama", keterangan: V26 },
  { tanggal: "2026-03-19", nama: "Hari Suci Nyepi Tahun Baru Saka 1948", jenis: "libur_nasional", keterangan: V26 },
  { tanggal: "2026-03-20", nama: "Idul Fitri 1447 H", jenis: "libur_nasional", keterangan: V26 },
  { tanggal: "2026-03-21", nama: "Idul Fitri 1447 H", jenis: "libur_nasional", keterangan: V26 },
  { tanggal: "2026-03-23", nama: "Cuti bersama Idul Fitri", jenis: "cuti_bersama", keterangan: V26 },
  { tanggal: "2026-03-24", nama: "Cuti bersama Idul Fitri", jenis: "cuti_bersama", keterangan: V26 },
  { tanggal: "2026-04-03", nama: "Wafat Yesus Kristus", jenis: "libur_nasional", keterangan: V26 },
  { tanggal: "2026-04-05", nama: "Kebangkitan Yesus Kristus (Paskah)", jenis: "libur_nasional", keterangan: V26 },
  { tanggal: "2026-05-01", nama: "Hari Buruh Internasional", jenis: "libur_nasional" },
  { tanggal: "2026-05-14", nama: "Kenaikan Yesus Kristus", jenis: "libur_nasional", keterangan: V26 },
  { tanggal: "2026-05-15", nama: "Cuti bersama Kenaikan Yesus Kristus", jenis: "cuti_bersama", keterangan: V26 },
  { tanggal: "2026-05-27", nama: "Idul Adha 1447 H", jenis: "libur_nasional", keterangan: V26 },
  { tanggal: "2026-05-28", nama: "Cuti bersama Idul Adha", jenis: "cuti_bersama", keterangan: V26 },
  { tanggal: "2026-05-31", nama: "Hari Raya Waisak 2570 BE", jenis: "libur_nasional", keterangan: V26 },
  { tanggal: "2026-06-01", nama: "Hari Lahir Pancasila", jenis: "libur_nasional" },
  { tanggal: "2026-06-16", nama: "Tahun Baru Islam 1448 H", jenis: "libur_nasional", keterangan: V26 },
  { tanggal: "2026-08-17", nama: "Hari Kemerdekaan Republik Indonesia", jenis: "libur_nasional" },
  { tanggal: "2026-08-25", nama: "Maulid Nabi Muhammad SAW", jenis: "libur_nasional", keterangan: V26 },
  { tanggal: "2026-12-24", nama: "Cuti bersama Hari Raya Natal", jenis: "cuti_bersama", keterangan: V26 },
  { tanggal: "2026-12-25", nama: "Hari Raya Natal", jenis: "libur_nasional" },
  // 2027: hanya libur bertanggal tetap. Lengkapi libur keagamaan & cuti bersama dari SKB 2027.
  { tanggal: "2027-01-01", nama: "Tahun Baru 2027 Masehi", jenis: "libur_nasional", keterangan: "Lengkapi libur keagamaan dan cuti bersama 2027 dari SKB 3 Menteri." },
  { tanggal: "2027-05-01", nama: "Hari Buruh Internasional", jenis: "libur_nasional" },
  { tanggal: "2027-06-01", nama: "Hari Lahir Pancasila", jenis: "libur_nasional" },
  { tanggal: "2027-08-17", nama: "Hari Kemerdekaan Republik Indonesia", jenis: "libur_nasional" },
  { tanggal: "2027-12-25", nama: "Hari Raya Natal", jenis: "libur_nasional" },
];

// Unit kerja penerima delegasi hukuman ringan (Pertor 70/2026 Pasal 14 ayat 3) —
// dicocokkan dengan awal nama unit saat impor. Disunting admin di Pengaturan → Unit kerja.
export const POLA_UNIT_DELEGASI = [
  "Fakultas", "Sekolah Pascasarjana", "Lembaga Penelitian dan Pengabdian", "Lembaga Pengembangan Pendidikan",
  "Badan Pengembangan Inovasi", "Badan Penjaminan Mutu", "Badan Pengelola Usaha", "Sekretariat Universitas", "Direktorat", "UPT",
];

// Bank pertanyaan substansi (contoh; disunting di Pengaturan → Pertanyaan pemeriksaan)
const SET_HADIR = "Ketidakhadiran kerja";
const SET_WEWENANG = "Penyalahgunaan wewenang / pungutan";
export const BANK_PERTANYAAN = [
  { nama_set: SET_HADIR, jenis_pelanggaran: "kehadiran", urutan: 1, pertanyaan: "Pada tanggal berapa saja Saudara tidak masuk kerja?" },
  { nama_set: SET_HADIR, jenis_pelanggaran: "kehadiran", urutan: 2, pertanyaan: "Apa alasan Saudara tidak masuk kerja pada tanggal-tanggal tersebut?" },
  { nama_set: SET_HADIR, jenis_pelanggaran: "kehadiran", urutan: 3, pertanyaan: "Apakah Saudara telah mengajukan izin atau cuti kepada atasan? Jika ya, mohon tunjukkan buktinya." },
  { nama_set: SET_HADIR, jenis_pelanggaran: "kehadiran", urutan: 4, pertanyaan: "Apakah Saudara mengetahui ketentuan jam kerja dan kewajiban masuk kerja?" },
  { nama_set: SET_HADIR, jenis_pelanggaran: "kehadiran", urutan: 5, pertanyaan: "Apakah rekapitulasi ketidakhadiran yang ditunjukkan kepada Saudara sudah sesuai?" },
  { nama_set: SET_WEWENANG, jenis_pelanggaran: "wewenang", urutan: 1, pertanyaan: "Apa tugas dan kewenangan Saudara dalam jabatan saat ini?" },
  { nama_set: SET_WEWENANG, jenis_pelanggaran: "wewenang", urutan: 2, pertanyaan: "Apakah Saudara pernah menerima atau meminta sesuatu yang berhubungan dengan jabatan Saudara?" },
  { nama_set: SET_WEWENANG, jenis_pelanggaran: "wewenang", urutan: 3, pertanyaan: "Siapa saja pihak yang terlibat dan bagaimana alurnya?" },
  { nama_set: SET_WEWENANG, jenis_pelanggaran: "wewenang", urutan: 4, pertanyaan: "Apakah ada dokumen atau bukti yang dapat Saudara tunjukkan terkait hal tersebut?" },
];
