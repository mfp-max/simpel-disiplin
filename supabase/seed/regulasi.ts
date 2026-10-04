// DATA AWAL peraturan (PRD §4 & §18). Seluruh isi berkas ini adalah data yang
// disalin ke tabel saat seed, lalu sepenuhnya dapat disunting admin.
//
// Penanda perlu_verifikasi = true berarti isi belum dicocokkan dengan naskah
// resmi (JDIH) — tampil sebagai lencana "Perlu verifikasi" di aplikasi.

import { FORMAT_DEFINISI, type DefinisiRegulasi, type DefJenis, type DefPasal, type DefTahapan, type DefTenggat } from "../../lib/regulasi/definisi";

const VERIF = "Teks disalin tanpa naskah resmi di tangan; cocokkan dengan naskah JDIH lalu hapus tanda verifikasi.";

const TINGKAT_3 = [
  { kode: "ringan", nama: "ringan", urutan: 1 },
  { kode: "sedang", nama: "sedang", urutan: 2 },
  { kode: "berat", nama: "berat", urutan: 3 },
];

const RINGAN_3: DefJenis[] = [
  { kode: "teguran_lisan", tingkat: "ringan", nama: "teguran lisan", urutan: 1 },
  { kode: "teguran_tertulis", tingkat: "ringan", nama: "teguran tertulis", urutan: 2 },
  { kode: "pernyataan_tidak_puas", tingkat: "ringan", nama: "pernyataan tidak puas secara tertulis", urutan: 3 },
];

// ---------------------------------------------------------------------------
// Tahapan (PRD §5.4) — bantuan kontekstual per tahap
// ---------------------------------------------------------------------------
const B = {
  telaah: "Menelaah informasi, bukti awal, dan identitas terperiksa untuk menentukan dugaan tingkat hukuman disiplin.",
  panggilan_1: "Terperiksa dipanggil secara tertulis. Surat Panggilan I disampaikan paling lambat 7 hari kerja sebelum tanggal pemeriksaan.",
  panggilan_2: "Jika terperiksa tidak hadir pada Panggilan I, Surat Panggilan II disampaikan paling lambat 7 hari kerja sejak tanggal seharusnya diperiksa. Jika tidak hadir lagi, hukuman disiplin dijatuhkan berdasarkan alat bukti dan keterangan yang ada tanpa pemeriksaan.",
  pemeriksaan: "Pemeriksaan dilakukan secara tertutup dan hasilnya dituangkan dalam Berita Acara Pemeriksaan.",
  bap: "Berita Acara Pemeriksaan ditandatangani pemeriksa dan terperiksa. Bersifat rahasia.",
  lhp: "Laporan hasil pemeriksaan memuat fakta, analisis, dan rekomendasi jenis hukuman disiplin kepada pejabat yang berwenang menghukum.",
  penetapan_sk: "Pejabat yang berwenang menetapkan keputusan hukuman disiplin. Satu pemeriksaan atas beberapa pelanggaran hanya menghasilkan satu jenis hukuman, yaitu yang terberat.",
  penyampaian_sk: "Keputusan hukuman disiplin disampaikan secara langsung kepada pegawai paling lambat 14 hari kerja sejak ditetapkan.",
  pengiriman_sk: "Jika pegawai tidak hadir saat penyampaian, keputusan dikirim paling lambat 3 hari kerja setelahnya.",
  berlaku: "Hukuman disiplin mulai berlaku pada hari kerja ke-15 sejak keputusan diterima.",
  menjalani: "Selama menjalani hukuman disiplin sedang/berat, kenaikan gaji berkala dan kenaikan pangkat tidak dapat diberikan.",
  selesai: "Kasus selesai setelah masa hukuman berakhir atau proses dihentikan.",
};

function tahapanA(): DefTahapan[] {
  const ringan = { tingkat_kode_in: ["ringan"] };
  const sb = { tingkat_kode_in: ["sedang", "berat"] };
  return [
    { kode_tahap: "telaah", nama: "Telaah", urutan: 10, status_kasus: "telaah", bantuan: B.telaah, jenis_dokumen: ["kronologi", "rekapitulasi_tmk", "keterangan_rekan_sejawat"] },
    { kode_tahap: "pembentukan_tim", nama: "Pembentukan Tim Pemeriksa oleh Rektor", urutan: 20, kondisi: sb, status_kasus: "pemeriksaan", pasal_rujukan: "PP 94/2021 Pasal 27; Kepmendiktisaintek 84/M/KEP/2025", bantuan: "Untuk dugaan hukuman sedang/berat, Rektor membentuk Tim Pemeriksa berdasarkan delegasi Kepmendiktisaintek 84/M/KEP/2025. Tim terdiri atas atasan langsung, unsur pengawasan, dan unsur kepegawaian; anggota tidak boleh berjabatan lebih rendah dari terperiksa.", jenis_dokumen: ["sk_tim_pemeriksa"] },
    { kode_tahap: "lapor_sekjen", nama: "Lapor salinan SK Tim Pemeriksa ke Sekjen (melalui Biro Organisasi dan SDM)", urutan: 25, kondisi: sb, status_kasus: "pemeriksaan", pasal_rujukan: "Kepmendiktisaintek 84/M/KEP/2025 Diktum KELIMA", bantuan: "Salinan keputusan pembentukan Tim Pemeriksa wajib disampaikan kepada Sekretaris Jenderal melalui Biro Organisasi dan Sumber Daya Manusia.", jenis_dokumen: ["lapor_sekjen"], perlu_verifikasi: true },
    { kode_tahap: "surat_tugas_sekretariat", nama: "Surat Tugas Tim Sekretariat", urutan: 27, opsional: true, kondisi: sb, status_kasus: "pemeriksaan", jenis_dokumen: ["surat_tugas_sekretariat"] },
    { kode_tahap: "panggilan_1", nama: "Surat Panggilan I", urutan: 30, status_kasus: "pemeriksaan", pasal_rujukan: "PP 94/2021 Pasal 26 ayat (2)", bantuan: B.panggilan_1, jenis_dokumen: ["surat_panggilan"] },
    { kode_tahap: "panggilan_2", nama: "Surat Panggilan II (jika tidak hadir)", urutan: 35, opsional: true, status_kasus: "pemeriksaan", pasal_rujukan: "PP 94/2021 Pasal 26 ayat (3)–(4)", bantuan: B.panggilan_2, jenis_dokumen: ["surat_panggilan", "bap_tidak_hadir"] },
    { kode_tahap: "pemeriksaan", nama: "Pemeriksaan oleh atasan langsung", urutan: 40, kondisi: ringan, status_kasus: "pemeriksaan", pasal_rujukan: "PP 94/2021 Pasal 27", bantuan: "Untuk dugaan hukuman ringan, pemeriksaan dilakukan oleh atasan langsung. Tidak dibentuk Tim Pemeriksa.", jenis_dokumen: ["persetujuan_rekam", "bap_tidak_hadir"] },
    { kode_tahap: "pemeriksaan", nama: "Pemeriksaan oleh Tim Pemeriksa", urutan: 40, kondisi: sb, status_kasus: "pemeriksaan", pasal_rujukan: "PP 94/2021 Pasal 27", bantuan: B.pemeriksaan, jenis_dokumen: ["persetujuan_rekam", "bap_tidak_hadir"] },
    { kode_tahap: "bap", nama: "Berita Acara Pemeriksaan", urutan: 45, status_kasus: "pemeriksaan", bantuan: B.bap, jenis_dokumen: ["bap"] },
    { kode_tahap: "lhp", nama: "Laporan hasil pemeriksaan", urutan: 50, kondisi: ringan, status_kasus: "penjatuhan", bantuan: B.lhp, jenis_dokumen: ["lhp", "lhp_tidak_hadir"] },
    { kode_tahap: "lhp", nama: "LHP dan rekomendasi Tim Pemeriksa", urutan: 50, kondisi: sb, status_kasus: "penjatuhan", bantuan: B.lhp, jenis_dokumen: ["lhp", "lhp_tidak_hadir"] },
    { kode_tahap: "nota_dinas_kewenangan", nama: "Nota Dinas Laporan Kewenangan", urutan: 55, kondisi: sb, status_kasus: "penjatuhan", bantuan: "Melaporkan kepada Rektor pejabat yang berwenang menjatuhkan hukuman disiplin sesuai tingkat dan jabatan terperiksa.", jenis_dokumen: ["nota_dinas_kewenangan"] },
    { kode_tahap: "usul_menteri", nama: "Usul penjatuhan hukuman kepada Menteri", urutan: 57, kondisi: { tingkat_kode_in: ["berat"], penjatuh_peran_in: ["menteri"] }, status_kasus: "penjatuhan", pasal_rujukan: "PerBKN 6/2022 Pasal 15 huruf c", bantuan: "Hukuman disiplin berat bagi Pejabat Administrator ke bawah dan pejabat fungsional merupakan kewenangan Menteri. Rektor menyampaikan usul beserta berkas pemeriksaan.", jenis_dokumen: ["usul_menteri"] },
    { kode_tahap: "penetapan_sk", nama: "Penetapan Keputusan Hukuman Disiplin", urutan: 60, status_kasus: "penjatuhan", pasal_rujukan: "PP 94/2021", bantuan: B.penetapan_sk, jenis_dokumen: ["sk_hukdis"] },
    { kode_tahap: "penyampaian_sk", nama: "Penyampaian Keputusan", urutan: 70, status_kasus: "penyampaian", pasal_rujukan: "PP 94/2021 Pasal 37 ayat (3)", bantuan: B.penyampaian_sk, jenis_dokumen: [] },
    { kode_tahap: "pengiriman_sk", nama: "Pengiriman Keputusan (jika tidak hadir saat penyampaian)", urutan: 72, opsional: true, status_kasus: "penyampaian", pasal_rujukan: "PerBKN 6/2022 Pasal 49 ayat (8)", bantuan: B.pengiriman_sk },
    { kode_tahap: "berlaku", nama: "Mulai berlaku (hari kerja ke-15)", urutan: 80, status_kasus: "berlaku", pasal_rujukan: "PerBKN 6/2022 Pasal 50 ayat (1)", bantuan: B.berlaku },
    { kode_tahap: "menjalani", nama: "Menjalani hukuman", urutan: 90, kondisi: sb, status_kasus: "menjalani", pasal_rujukan: "PerBKN 6/2022 Pasal 55 ayat (1)", bantuan: B.menjalani },
    { kode_tahap: "selesai", nama: "Selesai", urutan: 100, status_kasus: "selesai", bantuan: B.selesai },
  ];
}

function tahapanB(): DefTahapan[] {
  const ringan = { tingkat_kode_in: ["ringan"] };
  const sb = { tingkat_kode_in: ["sedang", "berat"] };
  return [
    { kode_tahap: "telaah", nama: "Telaah", urutan: 10, status_kasus: "telaah", bantuan: B.telaah, jenis_dokumen: ["kronologi", "rekapitulasi_tmk", "keterangan_rekan_sejawat"] },
    { kode_tahap: "pembentukan_tim", nama: "Pembentukan Tim Pemeriksa unit kerja oleh pimpinan unit kerja", urutan: 20, kondisi: ringan, status_kasus: "pemeriksaan", pasal_rujukan: "Pertor 70/2026", bantuan: "Menurut Peraturan Rektor 70/2026, pemeriksaan dugaan hukuman ringan pun dilakukan oleh Tim Pemeriksa unit kerja yang dibentuk pimpinan unit kerja.", jenis_dokumen: ["sk_tim_pemeriksa"], perlu_verifikasi: true },
    { kode_tahap: "pembentukan_tim", nama: "Pembentukan Tim Pemeriksa UM oleh Rektor", urutan: 20, kondisi: sb, status_kasus: "pemeriksaan", pasal_rujukan: "Pertor 70/2026", bantuan: "Untuk dugaan hukuman sedang/berat, Rektor membentuk Tim Pemeriksa UM.", jenis_dokumen: ["sk_tim_pemeriksa"], perlu_verifikasi: true },
    { kode_tahap: "panggilan_1", nama: "Surat Panggilan I", urutan: 30, status_kasus: "pemeriksaan", pasal_rujukan: "Pertor 70/2026 Pasal 16 ayat (3)", bantuan: B.panggilan_1, jenis_dokumen: ["surat_panggilan"] },
    { kode_tahap: "panggilan_2", nama: "Surat Panggilan II (jika tidak hadir)", urutan: 35, opsional: true, status_kasus: "pemeriksaan", pasal_rujukan: "Pertor 70/2026 Pasal 16 ayat (4)–(5)", bantuan: B.panggilan_2, jenis_dokumen: ["surat_panggilan", "bap_tidak_hadir"] },
    { kode_tahap: "pemeriksaan", nama: "Pemeriksaan oleh Tim Pemeriksa", urutan: 40, status_kasus: "pemeriksaan", bantuan: B.pemeriksaan, jenis_dokumen: ["persetujuan_rekam", "bap_tidak_hadir"] },
    { kode_tahap: "bap", nama: "Berita Acara Pemeriksaan", urutan: 45, status_kasus: "pemeriksaan", bantuan: B.bap, jenis_dokumen: ["bap"] },
    { kode_tahap: "lhp", nama: "Laporan hasil pemeriksaan kepada pimpinan unit kerja", urutan: 50, kondisi: ringan, status_kasus: "penjatuhan", bantuan: B.lhp, jenis_dokumen: ["lhp", "lhp_tidak_hadir"] },
    { kode_tahap: "lhp", nama: "Laporan hasil pemeriksaan kepada Rektor", urutan: 50, kondisi: sb, status_kasus: "penjatuhan", bantuan: B.lhp, jenis_dokumen: ["lhp", "lhp_tidak_hadir"] },
    { kode_tahap: "penetapan_sk", nama: "Penetapan Keputusan Hukuman Disiplin", urutan: 60, status_kasus: "penjatuhan", pasal_rujukan: "Pertor 70/2026 Pasal 14", bantuan: B.penetapan_sk, jenis_dokumen: ["sk_hukdis"] },
    { kode_tahap: "penyampaian_sk", nama: "Penyampaian Keputusan", urutan: 70, status_kasus: "penyampaian", pasal_rujukan: "Pertor 70/2026 Pasal 28 ayat (5)", bantuan: B.penyampaian_sk, jenis_dokumen: ["panggilan_penerimaan_sk"] },
    { kode_tahap: "pengiriman_sk", nama: "Pengiriman Keputusan (jika tidak hadir saat penyampaian)", urutan: 72, opsional: true, status_kasus: "penyampaian", pasal_rujukan: "Pertor 70/2026 Pasal 28 ayat (7)", bantuan: B.pengiriman_sk },
    { kode_tahap: "berlaku", nama: "Mulai berlaku (hari kerja ke-15)", urutan: 80, status_kasus: "berlaku", pasal_rujukan: "Pertor 70/2026 Pasal 29 ayat (1)", bantuan: B.berlaku },
    { kode_tahap: "menjalani", nama: "Menjalani hukuman + pemotongan insentif kinerja", urutan: 90, kondisi: sb, status_kasus: "menjalani", pasal_rujukan: "Pertor 70/2026 Pasal 8 ayat (5); Pasal 34 ayat (1)", bantuan: "Hukuman sedang dan berat disertai pemotongan insentif kinerja sesuai Peraturan Rektor tentang Insentif Kinerja. Selama menjalani hukuman, kenaikan gaji berkala dan kenaikan pangkat tidak dapat diberikan." },
    { kode_tahap: "selesai", nama: "Selesai", urutan: 100, status_kasus: "selesai", bantuan: B.selesai },
  ];
}

function tenggatBersama(p: { panggilan1: string; panggilan2: string; penyampaian: string; pengiriman: string; berlaku: string }): DefTenggat[] {
  return [
    { kode: "panggilan_1", nama_tenggat: "Surat Panggilan I diterima terperiksa", kode_tahap: "panggilan_1", dihitung_dari: "pemeriksaan", acuan_tanggal: "rencana", arah: "sebelum", jumlah: 7, satuan: "hari_kerja", pasal_rujukan: p.panggilan1 },
    { kode: "panggilan_2", nama_tenggat: "Surat Panggilan II disampaikan", kode_tahap: "panggilan_2", dihitung_dari: "pemeriksaan", acuan_tanggal: "rencana", arah: "sesudah", jumlah: 7, satuan: "hari_kerja", pasal_rujukan: p.panggilan2 },
    { kode: "penyampaian_sk", nama_tenggat: "Keputusan disampaikan kepada pegawai", kode_tahap: "penyampaian_sk", dihitung_dari: "penetapan_sk", arah: "sesudah", jumlah: 14, satuan: "hari_kerja", pasal_rujukan: p.penyampaian },
    { kode: "pengiriman_sk", nama_tenggat: "Keputusan dikirim (pegawai tidak hadir saat penyampaian)", kode_tahap: "pengiriman_sk", dihitung_dari: "penyampaian_sk", acuan_tanggal: "rencana", arah: "sesudah", jumlah: 3, satuan: "hari_kerja", pasal_rujukan: p.pengiriman },
    { kode: "berlaku", nama_tenggat: "Hukuman mulai berlaku (hari kerja ke-15 sejak diterima)", kode_tahap: "berlaku", dihitung_dari: "penyampaian_sk", arah: "sesudah", jumlah: 15, satuan: "hari_kerja", hitung_hari_dasar: false, pasal_rujukan: p.berlaku, catatan: "Hari diterimanya keputusan tidak dihitung; hari kerja berikutnya adalah hari ke-1." },
  ];
}

// ---------------------------------------------------------------------------
// PP 94/2021 — katalog pasal kewajiban & larangan
// ---------------------------------------------------------------------------
function pasalPP94(): DefPasal[] {
  const k3 = [
    "setia dan taat sepenuhnya kepada Pancasila, Undang-Undang Dasar Negara Republik Indonesia Tahun 1945, Negara Kesatuan Republik Indonesia, dan pemerintah",
    "menjaga persatuan dan kesatuan bangsa",
    "melaksanakan kebijakan yang ditetapkan oleh pejabat pemerintah yang berwenang",
    "menaati ketentuan peraturan perundang-undangan",
    "melaksanakan tugas kedinasan dengan penuh pengabdian, kejujuran, kesadaran, dan tanggung jawab",
    "menunjukkan integritas dan keteladanan dalam sikap, perilaku, ucapan, dan tindakan kepada setiap orang, baik di dalam maupun di luar kedinasan",
    "menyimpan rahasia jabatan dan hanya dapat mengemukakan rahasia jabatan sesuai dengan ketentuan peraturan perundang-undangan",
    "bersedia ditempatkan di seluruh wilayah Negara Kesatuan Republik Indonesia",
  ];
  const k4 = [
    "menghadiri dan mengucapkan sumpah/janji PNS",
    "menghadiri dan mengucapkan sumpah/janji jabatan",
    "mengutamakan kepentingan negara daripada kepentingan pribadi, seseorang, dan/atau golongan",
    "melaporkan dengan segera kepada atasannya apabila mengetahui ada hal yang dapat membahayakan keamanan negara atau merugikan keuangan negara",
    "melaporkan harta kekayaan kepada pejabat yang berwenang sesuai dengan ketentuan peraturan perundang-undangan",
    "masuk Kerja dan menaati ketentuan jam Kerja",
    "menggunakan dan memelihara barang milik negara dengan sebaik-baiknya",
    "memberikan kesempatan kepada bawahan untuk mengembangkan kompetensi",
    "menolak segala bentuk pemberian yang berkaitan dengan tugas dan fungsi kecuali penghasilan sesuai dengan ketentuan peraturan perundang-undangan",
  ];
  const l5 = [
    "menyalahgunakan wewenang",
    "menjadi perantara untuk mendapatkan keuntungan pribadi dan/atau orang lain dengan menggunakan kewenangan orang lain yang diduga terjadi konflik kepentingan dengan jabatan",
    "menjadi pegawai atau bekerja untuk negara lain",
    "bekerja pada lembaga atau organisasi internasional tanpa izin atau tanpa ditugaskan oleh Pejabat Pembina Kepegawaian",
    "bekerja pada perusahaan asing, konsultan asing, atau lembaga swadaya masyarakat asing kecuali ditugaskan oleh Pejabat Pembina Kepegawaian",
    "memiliki, menjual, membeli, menggadaikan, menyewakan, atau meminjamkan barang baik bergerak atau tidak bergerak, dokumen, atau surat berharga milik negara secara tidak sah",
    "melakukan pungutan di luar ketentuan",
    "melakukan kegiatan yang merugikan negara",
    "bertindak sewenang-wenang terhadap bawahan",
    "menghalangi berjalannya tugas kedinasan",
    "menerima hadiah yang berhubungan dengan jabatan dan/atau pekerjaan",
    "meminta sesuatu yang berhubungan dengan jabatan",
    "melakukan tindakan atau tidak melakukan tindakan yang dapat mengakibatkan kerugian bagi yang dilayani",
    "memberikan dukungan kepada calon Presiden/Wakil Presiden, calon Kepala Daerah/Wakil Kepala Daerah, calon anggota Dewan Perwakilan Rakyat, calon anggota Dewan Perwakilan Daerah, atau calon anggota Dewan Perwakilan Rakyat Daerah dengan cara: ikut kampanye; menjadi peserta kampanye dengan menggunakan atribut partai atau atribut PNS; sebagai peserta kampanye dengan mengerahkan PNS lain; sebagai peserta kampanye dengan menggunakan fasilitas negara; membuat keputusan dan/atau tindakan yang menguntungkan atau merugikan salah satu pasangan calon sebelum, selama, dan sesudah masa kampanye; mengadakan kegiatan yang mengarah kepada keberpihakan terhadap pasangan calon; dan/atau memberikan surat dukungan disertai fotokopi Kartu Tanda Penduduk atau Surat Keterangan Tanda Penduduk",
  ];
  const huruf = "abcdefghijklmnopqrstuvwxyz";
  return [
    ...k3.map((teks, i) => ({ jenis: "kewajiban", pasal: "3", huruf: huruf[i], teks, perlu_verifikasi: true, catatan: VERIF })),
    ...k4.map((teks, i) => ({ jenis: "kewajiban", pasal: "4", huruf: huruf[i], teks, perlu_verifikasi: true, catatan: VERIF })),
    ...l5.map((teks, i) => ({ jenis: "larangan", pasal: "5", huruf: huruf[i], teks, perlu_verifikasi: true, catatan: VERIF })),
  ];
}

function pasalPertor70(): DefPasal[] {
  const huruf = "abcdefghijklmnopqrstuvwxyz";
  const kosong = (pasal: string, h: string, jenis: string) =>
    `[Belum diisi — salin bunyi Peraturan Rektor UM Nomor 70 Tahun 2026 Pasal ${pasal} huruf ${h} (${jenis}).]`;
  return [
    ...Array.from({ length: 18 }, (_, i) => ({ jenis: "kewajiban", pasal: "5", huruf: huruf[i], teks: kosong("5", huruf[i], "kewajiban"), perlu_verifikasi: true, catatan: i === 14 ? "Menurut PRD §18.1 huruf o memuat kewajiban terkait kinerja, tanpa pemetaan hukuman." : "Naskah Pertor 70/2026 belum diunggah ke sistem." })),
    ...Array.from({ length: 19 }, (_, i) => ({ jenis: "larangan", pasal: "6", huruf: huruf[i], teks: kosong("6", huruf[i], "larangan"), perlu_verifikasi: true, catatan: "Naskah Pertor 70/2026 belum diunggah ke sistem." })),
  ];
}

const pemetaanDampak = (rujukan: string) => [
  { dampak: "unit_kerja", tingkat: "ringan", pasal_rujukan_pemetaan: rujukan, perlu_verifikasi: true, catatan: "Pola umum: berdampak negatif pada unit kerja → ringan." },
  { dampak: "instansi", tingkat: "sedang", pasal_rujukan_pemetaan: rujukan, perlu_verifikasi: true, catatan: "Pola umum: berdampak negatif pada instansi → sedang." },
  { dampak: "negara", tingkat: "berat", pasal_rujukan_pemetaan: rujukan, perlu_verifikasi: true, catatan: "Pola umum: berdampak negatif pada pemerintah dan/atau negara → berat." },
];

// ---------------------------------------------------------------------------
export const DEFINISI_AWAL: DefinisiRegulasi[] = [
  // ======================= PP 30/1980 (arsip) =======================
  {
    format: FORMAT_DEFINISI,
    regulasi: {
      kode: "PP_30_1980", jenis: "Peraturan Pemerintah", nomor: "30", tahun: 1980, judul: "Peraturan Disiplin Pegawai Negeri Sipil",
      nama_singkat: "PP 30/1980", nama_lengkap: "Peraturan Pemerintah Nomor 30 Tahun 1980 tentang Peraturan Disiplin Pegawai Negeri Sipil",
      rezim_kode: "A", utama: true, status: "nonaktif", berlaku_dari: "1980-08-30", berlaku_sampai: "2010-06-06",
      katalog_pasal_lengkap: false, catatan: "Untuk arsip kasus lampau. Pasal diisi sebagai teks bebas; 10 jenis hukuman.",
    },
    tingkat: TINGKAT_3,
    jenis_hukuman: [
      ...RINGAN_3,
      { kode: "tunda_kgb", tingkat: "sedang", nama: "penundaan kenaikan gaji berkala untuk paling lama 1 (satu) tahun", urutan: 4, durasi_bulan: 12 },
      { kode: "turun_gaji_kgb", tingkat: "sedang", nama: "penurunan gaji sebesar satu kali kenaikan gaji berkala untuk paling lama 1 (satu) tahun", urutan: 5, durasi_bulan: 12 },
      { kode: "tunda_kp", tingkat: "sedang", nama: "penundaan kenaikan pangkat untuk paling lama 1 (satu) tahun", urutan: 6, durasi_bulan: 12 },
      { kode: "turun_pangkat", tingkat: "berat", nama: "penurunan pangkat pada pangkat yang setingkat lebih rendah untuk paling lama 1 (satu) tahun", urutan: 7, durasi_bulan: 12 },
      { kode: "bebas_jabatan", tingkat: "berat", nama: "pembebasan dari jabatan", urutan: 8 },
      { kode: "pdhtaps", tingkat: "berat", nama: "pemberhentian dengan hormat tidak atas permintaan sendiri sebagai Pegawai Negeri Sipil", urutan: 9 },
      { kode: "ptdh", tingkat: "berat", nama: "pemberhentian tidak dengan hormat sebagai Pegawai Negeri Sipil", urutan: 10 },
    ],
    fixture: [
      { nama: "PP 30/1980 memiliki 10 jenis hukuman", masukan: { jenis: "jumlah_jenis" }, harapan: { jumlah: 10 } },
      { nama: "PP 30/1980 tidak mengatur ambang kehadiran per hari", masukan: { jenis: "kehadiran", hari: 20 }, harapan: { tidak_ada_ambang: true } },
      { nama: "PP 30/1980 memiliki 3 tingkat", masukan: { jenis: "jumlah_tingkat" }, harapan: { jumlah: 3 } },
    ],
  },

  // ======================= PP 53/2010 (arsip) =======================
  {
    format: FORMAT_DEFINISI,
    regulasi: {
      kode: "PP_53_2010", jenis: "Peraturan Pemerintah", nomor: "53", tahun: 2010, judul: "Disiplin Pegawai Negeri Sipil",
      nama_singkat: "PP 53/2010", nama_lengkap: "Peraturan Pemerintah Nomor 53 Tahun 2010 tentang Disiplin Pegawai Negeri Sipil",
      rezim_kode: "A", utama: true, status: "nonaktif", berlaku_dari: "2010-06-06", berlaku_sampai: "2021-08-31",
      katalog_pasal_lengkap: false, catatan: "Dicabut PP 94/2021. Untuk arsip; pasal diisi sebagai teks bebas; 11 jenis hukuman.",
    },
    tingkat: TINGKAT_3,
    jenis_hukuman: [
      ...RINGAN_3,
      { kode: "tunda_kgb", tingkat: "sedang", nama: "penundaan kenaikan gaji berkala selama 1 (satu) tahun", urutan: 4, durasi_bulan: 12, blokir_kgb: true },
      { kode: "tunda_kp", tingkat: "sedang", nama: "penundaan kenaikan pangkat selama 1 (satu) tahun", urutan: 5, durasi_bulan: 12, blokir_kenaikan_pangkat: true },
      { kode: "turun_pangkat_1th", tingkat: "sedang", nama: "penurunan pangkat setingkat lebih rendah selama 1 (satu) tahun", urutan: 6, durasi_bulan: 12 },
      { kode: "turun_pangkat_3th", tingkat: "berat", nama: "penurunan pangkat setingkat lebih rendah selama 3 (tiga) tahun", urutan: 7, durasi_bulan: 36 },
      { kode: "pindah_turun_jabatan", tingkat: "berat", nama: "pemindahan dalam rangka penurunan jabatan setingkat lebih rendah", urutan: 8 },
      { kode: "bebas_jabatan", tingkat: "berat", nama: "pembebasan dari jabatan", urutan: 9 },
      { kode: "pdhtaps", tingkat: "berat", nama: "pemberhentian dengan hormat tidak atas permintaan sendiri sebagai PNS", urutan: 10 },
      { kode: "ptdh", tingkat: "berat", nama: "pemberhentian tidak dengan hormat sebagai PNS", urutan: 11 },
    ],
    ambang: [
      { hari_min: 5, hari_max: 5, tingkat: "ringan", jenis: "teguran_lisan", pasal_rujukan: "PP 53/2010 Pasal 8 angka 9", perlu_verifikasi: true },
      { hari_min: 6, hari_max: 10, tingkat: "ringan", jenis: "teguran_tertulis", pasal_rujukan: "PP 53/2010 Pasal 8 angka 9", perlu_verifikasi: true },
      { hari_min: 11, hari_max: 15, tingkat: "ringan", jenis: "pernyataan_tidak_puas", pasal_rujukan: "PP 53/2010 Pasal 8 angka 9", perlu_verifikasi: true },
      { hari_min: 16, hari_max: 20, tingkat: "sedang", jenis: "tunda_kgb", pasal_rujukan: "PP 53/2010 Pasal 9 angka 11", perlu_verifikasi: true },
      { hari_min: 21, hari_max: 25, tingkat: "sedang", jenis: "tunda_kp", pasal_rujukan: "PP 53/2010 Pasal 9 angka 11", perlu_verifikasi: true },
      { hari_min: 26, hari_max: 30, tingkat: "sedang", jenis: "turun_pangkat_1th", pasal_rujukan: "PP 53/2010 Pasal 9 angka 11", perlu_verifikasi: true },
      { hari_min: 31, hari_max: 35, tingkat: "berat", jenis: "turun_pangkat_3th", pasal_rujukan: "PP 53/2010 Pasal 10 angka 9", perlu_verifikasi: true },
      { hari_min: 36, hari_max: 40, tingkat: "berat", jenis: "pindah_turun_jabatan", pasal_rujukan: "PP 53/2010 Pasal 10 angka 9", perlu_verifikasi: true },
      { hari_min: 41, hari_max: 45, tingkat: "berat", jenis: "bebas_jabatan", pasal_rujukan: "PP 53/2010 Pasal 10 angka 9", perlu_verifikasi: true },
      { hari_min: 46, hari_max: null, tingkat: "berat", jenis: "pdhtaps", pasal_rujukan: "PP 53/2010 Pasal 10 angka 9", akibat_tambahan: "atau pemberhentian tidak dengan hormat sebagai PNS", perlu_verifikasi: true },
    ],
    fixture: [
      { nama: "PP 53/2010: 12 hari TMK → ringan, pernyataan tidak puas", masukan: { jenis: "kehadiran", hari: 12 }, harapan: { tingkat: "ringan", jenis_kode: "pernyataan_tidak_puas" } },
      { nama: "PP 53/2010: 18 hari TMK → sedang, penundaan KGB", masukan: { jenis: "kehadiran", hari: 18 }, harapan: { tingkat: "sedang", jenis_kode: "tunda_kgb" } },
      { nama: "PP 53/2010: 46 hari TMK → berat, PDHTAPS", masukan: { jenis: "kehadiran", hari: 46 }, harapan: { tingkat: "berat", jenis_kode: "pdhtaps" } },
      { nama: "PP 53/2010: 4 hari TMK belum kena hukuman", masukan: { jenis: "kehadiran", hari: 4 }, harapan: { tidak_ada_ambang: true } },
      { nama: "PP 53/2010 memiliki 11 jenis hukuman", masukan: { jenis: "jumlah_jenis" }, harapan: { jumlah: 11 } },
    ],
  },

  // ======================= PP 94/2021 (berlaku) =======================
  {
    format: FORMAT_DEFINISI,
    regulasi: {
      kode: "PP_94_2021", jenis: "Peraturan Pemerintah", nomor: "94", tahun: 2021, judul: "Disiplin Pegawai Negeri Sipil",
      nama_singkat: "PP 94/2021", nama_lengkap: "Peraturan Pemerintah Nomor 94 Tahun 2021 tentang Disiplin Pegawai Negeri Sipil",
      rezim_kode: "A", utama: true, status: "aktif", berlaku_dari: "2021-08-31", berlaku_sampai: null, ditetapkan_pada: "2021-08-31",
      menggantikan_kode: "PP_53_2010", katalog_pasal_lengkap: true,
    },
    terkait: [
      { kode: "PERBKN_6_2022", peran: "juknis" },
      { kode: "KEPMEN_84_2025", peran: "delegasi", keterangan: "Delegasi pembentukan Tim Pemeriksa sedang/berat kepada Rektor" },
      { kode: "PP_10_1983", peran: "pelengkap", keterangan: "Pelanggaran izin perkawinan/perceraian diancam salah satu hukuman disiplin berat" },
      { kode: "PERKA_BKN_25_2015", peran: "pelengkap" },
    ],
    tingkat: TINGKAT_3,
    jenis_hukuman: [
      ...RINGAN_3,
      {
        kode: "tukin_25_6", tingkat: "sedang", nama: "pemotongan tunjangan kinerja sebesar 25% (dua puluh lima persen) selama 6 (enam) bulan", urutan: 4, durasi_bulan: 6,
        pengganti_sementara: "tunda_kgb_transisi", blokir_kgb: true, blokir_kenaikan_pangkat: true, pasal_rujukan: "PP 94/2021 Pasal 8 ayat (3)",
        peringatan: "Belum berlaku sampai PP tentang Gaji dan Tunjangan terbit (PP 94/2021 Pasal 42; PerBKN 6/2022 Pasal 62). Sementara dijatuhkan: penundaan kenaikan gaji berkala 1 tahun.",
      },
      {
        kode: "tukin_25_9", tingkat: "sedang", nama: "pemotongan tunjangan kinerja sebesar 25% (dua puluh lima persen) selama 9 (sembilan) bulan", urutan: 5, durasi_bulan: 9,
        pengganti_sementara: "tunda_kp_transisi", blokir_kgb: true, blokir_kenaikan_pangkat: true, pasal_rujukan: "PP 94/2021 Pasal 8 ayat (3)",
        peringatan: "Belum berlaku sampai PP tentang Gaji dan Tunjangan terbit. Sementara dijatuhkan: penundaan kenaikan pangkat 1 tahun.",
      },
      {
        kode: "tukin_25_12", tingkat: "sedang", nama: "pemotongan tunjangan kinerja sebesar 25% (dua puluh lima persen) selama 12 (dua belas) bulan", urutan: 6, durasi_bulan: 12,
        pengganti_sementara: "turun_pangkat_transisi", blokir_kgb: true, blokir_kenaikan_pangkat: true, pasal_rujukan: "PP 94/2021 Pasal 8 ayat (3)",
        peringatan: "Belum berlaku sampai PP tentang Gaji dan Tunjangan terbit. Sementara dijatuhkan: penurunan pangkat setingkat lebih rendah 1 tahun.",
      },
      { kode: "tunda_kgb_transisi", tingkat: "sedang", nama: "penundaan kenaikan gaji berkala selama 1 (satu) tahun", urutan: 7, durasi_bulan: 12, blokir_kgb: true, blokir_kenaikan_pangkat: true, catatan: "Hukuman pengganti sementara (masa transisi PP 94/2021 Pasal 42)." },
      { kode: "tunda_kp_transisi", tingkat: "sedang", nama: "penundaan kenaikan pangkat selama 1 (satu) tahun", urutan: 8, durasi_bulan: 12, blokir_kgb: true, blokir_kenaikan_pangkat: true, catatan: "Hukuman pengganti sementara (masa transisi PP 94/2021 Pasal 42)." },
      { kode: "turun_pangkat_transisi", tingkat: "sedang", nama: "penurunan pangkat setingkat lebih rendah selama 1 (satu) tahun", urutan: 9, durasi_bulan: 12, blokir_kgb: true, blokir_kenaikan_pangkat: true, catatan: "Hukuman pengganti sementara (masa transisi PP 94/2021 Pasal 42)." },
      { kode: "turun_jabatan", tingkat: "berat", nama: "penurunan jabatan setingkat lebih rendah selama 12 (dua belas) bulan", urutan: 10, durasi_bulan: 12, blokir_kgb: true, blokir_kenaikan_pangkat: true, pasal_rujukan: "PP 94/2021 Pasal 8 ayat (4)" },
      { kode: "bebas_jabatan_pelaksana", tingkat: "berat", nama: "pembebasan dari jabatannya menjadi jabatan pelaksana selama 12 (dua belas) bulan", urutan: 11, durasi_bulan: 12, blokir_kgb: true, blokir_kenaikan_pangkat: true, pasal_rujukan: "PP 94/2021 Pasal 8 ayat (4)" },
      { kode: "pdhtaps", tingkat: "berat", nama: "pemberhentian dengan hormat tidak atas permintaan sendiri sebagai PNS", urutan: 12, pasal_rujukan: "PP 94/2021 Pasal 8 ayat (4)" },
    ],
    pasal: pasalPP94(),
    ambang: [
      { hari_min: 3, hari_max: 3, tingkat: "ringan", jenis: "teguran_lisan", pasal_rujukan: "PP 94/2021 — ketentuan hukuman atas kewajiban masuk kerja (Pasal 4 huruf f)", perlu_verifikasi: true },
      { hari_min: 4, hari_max: 6, tingkat: "ringan", jenis: "teguran_tertulis", pasal_rujukan: "PP 94/2021 — ketentuan hukuman atas kewajiban masuk kerja (Pasal 4 huruf f)", perlu_verifikasi: true },
      { hari_min: 7, hari_max: 10, tingkat: "ringan", jenis: "pernyataan_tidak_puas", pasal_rujukan: "PP 94/2021 — ketentuan hukuman atas kewajiban masuk kerja (Pasal 4 huruf f)", perlu_verifikasi: true },
      { hari_min: 11, hari_max: 13, tingkat: "sedang", jenis: "tukin_25_6", pasal_rujukan: "PP 94/2021 — ketentuan hukuman atas kewajiban masuk kerja (Pasal 4 huruf f)", perlu_verifikasi: true },
      { hari_min: 14, hari_max: 16, tingkat: "sedang", jenis: "tukin_25_9", pasal_rujukan: "PP 94/2021 — ketentuan hukuman atas kewajiban masuk kerja (Pasal 4 huruf f)", perlu_verifikasi: true },
      { hari_min: 17, hari_max: 20, tingkat: "sedang", jenis: "tukin_25_12", pasal_rujukan: "PP 94/2021 — ketentuan hukuman atas kewajiban masuk kerja (Pasal 4 huruf f)", perlu_verifikasi: true },
      { hari_min: 21, hari_max: 24, tingkat: "berat", jenis: "turun_jabatan", pasal_rujukan: "PP 94/2021 — ketentuan hukuman atas kewajiban masuk kerja (Pasal 4 huruf f)", perlu_verifikasi: true },
      { hari_min: 25, hari_max: 27, tingkat: "berat", jenis: "bebas_jabatan_pelaksana", pasal_rujukan: "PP 94/2021 — ketentuan hukuman atas kewajiban masuk kerja (Pasal 4 huruf f)", perlu_verifikasi: true },
      { hari_min: 28, hari_max: null, tingkat: "berat", jenis: "pdhtaps", pasal_rujukan: "PP 94/2021 — ketentuan hukuman atas kewajiban masuk kerja (Pasal 4 huruf f)", perlu_verifikasi: true },
      {
        hari_min: 10, hari_max: null, berturut_turut: true, tingkat: "berat", jenis: "pdhtaps", alur_khusus: "penghentian_gaji",
        akibat_tambahan: "penghentian pembayaran gaji sejak bulan berikutnya, tanpa menunggu keputusan hukuman disiplin",
        pasal_rujukan: "PP 94/2021 — tidak masuk kerja 10 hari kerja berturut-turut", perlu_verifikasi: true,
      },
    ],
    tenggat: [
      ...tenggatBersama({
        panggilan1: "PP 94/2021 Pasal 26 ayat (2)", panggilan2: "PP 94/2021 Pasal 26 ayat (3)", penyampaian: "PP 94/2021 Pasal 37 ayat (3)",
        pengiriman: "PerBKN 6/2022 Pasal 49 ayat (8)", berlaku: "PerBKN 6/2022 Pasal 50 ayat (1)",
      }),
      { kode: "lapor_sekjen", nama_tenggat: "Salinan SK Tim Pemeriksa dilaporkan ke Sekjen", kode_tahap: "lapor_sekjen", dihitung_dari: "pembentukan_tim", arah: "sesudah", jumlah: 5, satuan: "hari_kerja", sifat: "pengingat_internal", pasal_rujukan: "Kepmendiktisaintek 84/M/KEP/2025 Diktum KELIMA", catatan: "Kepmen tidak menyebut jangka waktu; ini pengingat internal." },
      { kode: "upaya_administratif", nama_tenggat: "Pengingat tindak lanjut upaya administratif", kode_tahap: "upaya_administratif", dihitung_dari: "penyampaian_sk", arah: "sesudah", jumlah: 14, satuan: "hari_kerja", sifat: "pengingat_internal", pasal_rujukan: "Diatur peraturan pemerintah tersendiri tentang upaya administratif", catatan: "Pengingat internal, bukan tenggat hukum." },
    ],
    kewenangan: [
      { tingkat: "ringan", jenis: "pemeriksa", peran_kode: "atasan_langsung", nama_peran: "Atasan langsung", prioritas: 10, hasil: { bentuk_tim: "tidak" }, pasal_rujukan: "PP 94/2021 Pasal 27", catatan: "Jangan bentuk Tim Pemeriksa untuk kasus ringan." },
      { tingkat: "sedang", jenis: "pemeriksa", peran_kode: "tim_pemeriksa", nama_peran: "Tim Pemeriksa", prioritas: 10, hasil: { bentuk_tim: "boleh" }, pasal_rujukan: "PP 94/2021 Pasal 27" },
      { tingkat: "berat", jenis: "pemeriksa", peran_kode: "tim_pemeriksa", nama_peran: "Tim Pemeriksa", prioritas: 10, hasil: { bentuk_tim: "wajib" }, pasal_rujukan: "PP 94/2021 Pasal 27" },
      { tingkat: "sedang", jenis: "pembentuk_tim", peran_kode: "rektor", nama_peran: "Rektor", prioritas: 10, hasil: { lapor_sekjen: true }, pasal_rujukan: "Kepmendiktisaintek 84/M/KEP/2025" },
      { tingkat: "berat", jenis: "pembentuk_tim", peran_kode: "rektor", nama_peran: "Rektor", prioritas: 10, hasil: { lapor_sekjen: true }, pasal_rujukan: "Kepmendiktisaintek 84/M/KEP/2025" },
      { tingkat: "ringan", jenis: "penjatuh", peran_kode: "rektor", nama_peran: "Rektor", lingkup: "satu_tingkat_di_bawah", syarat_tambahan: { terperiksa_pimpinan_unit: true }, prioritas: 10, pasal_rujukan: "PerBKN 6/2022 Pasal 32 huruf a", catatan: "Rektor (setara JPT Madya) berwenang menjatuhkan hukuman ringan bagi pegawai satu tingkat di bawahnya." },
      { tingkat: "ringan", jenis: "penjatuh", peran_kode: "pejabat_atasan_berjenjang", nama_peran: "Pejabat atasan terperiksa sesuai jenjang", lingkup: "tertentu", prioritas: 20, pasal_rujukan: "PerBKN 6/2022 Pasal 15–32", perlu_verifikasi: true, hasil: { peringatan: "Sistem tidak dapat memastikan jenjang jabatan secara otomatis. Pastikan pejabat penjatuh sesuai jenjang menurut PerBKN 6/2022." } },
      { tingkat: "sedang", jenis: "penjatuh", peran_kode: "rektor", nama_peran: "Rektor", lingkup: "dua_tingkat_di_bawah", prioritas: 10, pasal_rujukan: "PerBKN 6/2022 Pasal 32 huruf a", catatan: "Rektor berwenang menjatuhkan hukuman sedang bagi pegawai dua tingkat di bawahnya." },
      { tingkat: "berat", jenis: "penjatuh", peran_kode: "menteri", nama_peran: "Menteri", lingkup: "tertentu", prioritas: 10, hasil: { usul_menteri: true }, pasal_rujukan: "PerBKN 6/2022 Pasal 15 huruf c", catatan: "Penjatuhan hukuman tidak didelegasikan. Hukuman berat bagi Pejabat Administrator ke bawah dan pejabat fungsional tetap kewenangan Menteri." },
    ],
    tahapan: tahapanA(),
    pemetaan: pemetaanDampak("PP 94/2021 Pasal 9–14"),
    kaidah: [
      { kunci: "hd_ringan_boleh_keberatan", nilai: "diatur_pp_tersendiri", catatan: "Lihat PP tentang upaya administratif." },
      { kunci: "pemberat_pengulangan_berlaku_untuk_kehadiran", nilai: false, pasal_rujukan: "PerBKN 6/2022 Pasal 46 ayat (7)" },
      { kunci: "satu_pelanggaran_satu_hukuman", nilai: true, catatan: "Beberapa pelanggaran dalam satu pemeriksaan → hanya satu hukuman, yang terberat." },
      { kunci: "larangan_hukum_dua_kali_satu_pelanggaran", nilai: true, pasal_rujukan: "PP 94/2021 Pasal 35 ayat (3)" },
      { kunci: "pemeriksa_ringan", nilai: "atasan_langsung", pasal_rujukan: "PP 94/2021 Pasal 27" },
      { kunci: "tim_wajib_untuk", nilai: ["berat"], pasal_rujukan: "PP 94/2021 Pasal 27" },
      { kunci: "hari_berlaku_sk", nilai: { jumlah: 15, satuan: "hari_kerja" }, pasal_rujukan: "PerBKN 6/2022 Pasal 50 ayat (1)", catatan: "Informasi. Perhitungan memakai aturan tenggat berkode 'berlaku'." },
      { kunci: "pemotongan_insentif_otomatis", nilai: false },
      { kunci: "pemberat_pengulangan", nilai: { berlaku: true }, catatan: "Pernah dihukum lalu mengulang pelanggaran sejenis → hukuman lebih berat." },
      { kunci: "larangan_pindah_unit_saat_status", nilai: ["telaah", "pemeriksaan", "penjatuhan", "penyampaian", "upaya_administratif"], catatan: "Pegawai yang sedang diperiksa atau mengajukan upaya administratif tidak boleh disetujui pindah unit kerja." },
      { kunci: "komposisi_tim", nilai: { unsur_wajib: ["atasan_langsung", "pengawasan", "kepegawaian"], jabatan_wajib: ["ketua", "sekretaris", "anggota"] }, pasal_rujukan: "PP 94/2021 Pasal 27; PerBKN 6/2022 Pasal 29", perlu_verifikasi: true },
      { kunci: "syarat_jabatan_anggota_tim", nilai: { pembanding: "golongan_ruang", tidak_boleh_lebih_rendah: true }, pasal_rujukan: "PerBKN 6/2022 Pasal 29", perlu_verifikasi: true, catatan: "Jabatan/pangkat anggota Tim Pemeriksa tidak boleh lebih rendah dari pegawai yang diperiksa." },
      { kunci: "atasan_terlibat", nilai: "atasan_lebih_tinggi_berjenjang", pasal_rujukan: "PerBKN 6/2022 Pasal 29 ayat (6)" },
      { kunci: "dugaan_pidana", nilai: "proses_berlanjut_kecuali_ptdh_menunggu_inkracht", catatan: "Proses disiplin tetap berjalan; kecuali yang berakibat pemberhentian tidak dengan hormat, menunggu putusan berkekuatan hukum tetap." },
      {
        kunci: "konsideran_mengingat",
        nilai: [
          "Undang-Undang Nomor 20 Tahun 2023 tentang Aparatur Sipil Negara;",
          "Peraturan Pemerintah Nomor 94 Tahun 2021 tentang Disiplin Pegawai Negeri Sipil;",
          "Peraturan Badan Kepegawaian Negara Nomor 6 Tahun 2022 tentang Peraturan Pelaksanaan Peraturan Pemerintah Nomor 94 Tahun 2021 tentang Disiplin Pegawai Negeri Sipil;",
          "Keputusan Menteri Pendidikan Tinggi, Sains, dan Teknologi Nomor 84/M/KEP/2025;",
        ],
        perlu_verifikasi: true, catatan: "Lengkapi dengan statuta dan peraturan internal UM yang relevan.",
      },
    ],
    fixture: [
      { nama: "PP 94/2021: 15 hari TMK → sedang jenis ke-2", masukan: { jenis: "kehadiran", hari: 15 }, harapan: { tingkat: "sedang", jenis_kode: "tukin_25_9" } },
      { nama: "PP 94/2021: 3 hari TMK → teguran lisan", masukan: { jenis: "kehadiran", hari: 3 }, harapan: { tingkat: "ringan", jenis_kode: "teguran_lisan" } },
      { nama: "PP 94/2021: 28 hari TMK → PDHTAPS", masukan: { jenis: "kehadiran", hari: 28 }, harapan: { tingkat: "berat", jenis_kode: "pdhtaps" } },
      { nama: "PP 94/2021: 10 hari berturut-turut → alur penghentian gaji", masukan: { jenis: "kehadiran", hari: 10, berturut_turut: true }, harapan: { tingkat: "berat", jenis_kode: "pdhtaps", alur_khusus: "penghentian_gaji" } },
      { nama: "PP 94/2021: kasus berat memuat Tim oleh Rektor, lapor Sekjen, usul Menteri", masukan: { jenis: "tahapan", tingkat: "berat" }, harapan: { berisi: ["pembentukan_tim", "lapor_sekjen", "usul_menteri"] } },
      { nama: "PP 94/2021: kasus ringan tanpa Tim Pemeriksa", masukan: { jenis: "tahapan", tingkat: "ringan" }, harapan: { tidak_berisi: ["pembentukan_tim", "lapor_sekjen"] } },
      { nama: "PP 94/2021: diterima Selasa 14 Juli 2026 → berlaku 4 Agustus 2026", masukan: { jenis: "tenggat", kode: "berlaku", tanggal: "2026-07-14" }, harapan: { tanggal: "2026-08-04" } },
    ],
  },

  // ======================= Pendukung rezim A =======================
  {
    format: FORMAT_DEFINISI,
    regulasi: {
      kode: "PERBKN_6_2022", jenis: "Peraturan Badan Kepegawaian Negara", nomor: "6", tahun: 2022,
      judul: "Peraturan Pelaksanaan Peraturan Pemerintah Nomor 94 Tahun 2021 tentang Disiplin Pegawai Negeri Sipil",
      nama_singkat: "PerBKN 6/2022",
      nama_lengkap: "Peraturan Badan Kepegawaian Negara Nomor 6 Tahun 2022 tentang Peraturan Pelaksanaan Peraturan Pemerintah Nomor 94 Tahun 2021 tentang Disiplin Pegawai Negeri Sipil",
      rezim_kode: "A", utama: false, status: "aktif", berlaku_dari: "2022-03-21", perlu_verifikasi: true,
      catatan: "Petunjuk teknis PP 94/2021. Tanggal berlaku perlu dicocokkan dengan naskah resmi.",
    },
  },
  {
    format: FORMAT_DEFINISI,
    regulasi: {
      kode: "KEPMEN_84_2025", jenis: "Keputusan Menteri", nomor: "84/M/KEP/2025", tahun: 2025,
      judul: "Pendelegasian Kewenangan Pemeriksaan dan Pembentukan Tim Pemeriksa kepada Rektor",
      nama_singkat: "Kepmendiktisaintek 84/M/KEP/2025",
      nama_lengkap: "Keputusan Menteri Pendidikan Tinggi, Sains, dan Teknologi Nomor 84/M/KEP/2025",
      rezim_kode: "A", utama: false, status: "aktif", berlaku_dari: "2025-03-13", perlu_verifikasi: true,
      catatan: "Disampaikan lewat Surat Sekjen Nomor 991/A/KP.04.04/2025. Diktum KEEMPAT memungkinkan penarikan delegasi oleh Menteri — pastikan masih berlaku.",
    },
  },
  {
    format: FORMAT_DEFINISI,
    regulasi: {
      kode: "PP_10_1983", jenis: "Peraturan Pemerintah", nomor: "10", tahun: 1983,
      judul: "Izin Perkawinan dan Perceraian bagi Pegawai Negeri Sipil",
      nama_singkat: "PP 10/1983 jo. PP 45/1990",
      nama_lengkap: "Peraturan Pemerintah Nomor 10 Tahun 1983 tentang Izin Perkawinan dan Perceraian bagi Pegawai Negeri Sipil sebagaimana telah diubah dengan Peraturan Pemerintah Nomor 45 Tahun 1990",
      rezim_kode: "A", utama: false, status: "aktif", berlaku_dari: "1983-04-21",
      catatan: "Masih berlaku. Pelanggarannya diancam salah satu hukuman disiplin berat (PP 94/2021 Pasal 41).",
    },
  },
  {
    format: FORMAT_DEFINISI,
    regulasi: {
      kode: "PERKA_BKN_25_2015", jenis: "Peraturan Kepala Badan Kepegawaian Negara", nomor: "25", tahun: 2015,
      judul: "Penanganan Penggunaan Ijazah Palsu", nama_singkat: "Perka BKN 25/2015",
      nama_lengkap: "Peraturan Kepala Badan Kepegawaian Negara Nomor 25 Tahun 2015",
      rezim_kode: "A", utama: false, status: "aktif", berlaku_dari: "2015-07-02", perlu_verifikasi: true,
      peringatan: "Disusun di atas PP 53/2010 dan UU 5/2014 yang sudah diganti. Bagian tindakan administratif masih dipakai; pemetaan hukuman disiplin harus mengikuti PP 94/2021.",
    },
  },

  // ======================= Pertor UM 70/2026 (rezim B) =======================
  {
    format: FORMAT_DEFINISI,
    regulasi: {
      kode: "PERTOR_70_2026", jenis: "Peraturan Rektor", nomor: "70", tahun: 2026, judul: "Disiplin Pegawai yang Diangkat oleh Rektor",
      nama_singkat: "Pertor UM 70/2026",
      nama_lengkap: "Peraturan Rektor Universitas Negeri Malang Nomor 70 Tahun 2026 tentang Disiplin Pegawai yang Diangkat oleh Rektor",
      rezim_kode: "B", utama: true, status: "aktif", berlaku_dari: "2026-06-22", ditetapkan_pada: "2026-06-22", katalog_pasal_lengkap: true,
      catatan: "Kewajiban di Pasal 5 (huruf a–r), larangan di Pasal 6 (huruf a–s). Jangan memakai penomoran pasal PP 94/2021.",
    },
    tingkat: TINGKAT_3,
    jenis_hukuman: [
      ...RINGAN_3,
      { kode: "tunda_kgb", tingkat: "sedang", nama: "penundaan kenaikan gaji berkala selama 12 (dua belas) bulan", urutan: 4, durasi_bulan: 12, blokir_kgb: true, blokir_kenaikan_pangkat: true, pasal_rujukan: "Pertor 70/2026 Pasal 8" },
      { kode: "tunda_kp", tingkat: "sedang", nama: "penundaan kenaikan pangkat selama 12 (dua belas) bulan", urutan: 5, durasi_bulan: 12, blokir_kgb: true, blokir_kenaikan_pangkat: true, pasal_rujukan: "Pertor 70/2026 Pasal 8" },
      { kode: "turun_pangkat", tingkat: "sedang", nama: "penurunan pangkat setingkat lebih rendah selama 12 (dua belas) bulan", urutan: 6, durasi_bulan: 12, blokir_kgb: true, blokir_kenaikan_pangkat: true, pasal_rujukan: "Pertor 70/2026 Pasal 8" },
      { kode: "turun_jabatan", tingkat: "berat", nama: "penurunan jabatan Fungsional atau Pelaksana setingkat lebih rendah selama 12 (dua belas) bulan", urutan: 7, durasi_bulan: 12, blokir_kgb: true, blokir_kenaikan_pangkat: true, pasal_rujukan: "Pertor 70/2026 Pasal 8" },
      { kode: "bebas_jabatan_pelaksana", tingkat: "berat", nama: "pembebasan dari jabatan Fungsional menjadi jabatan Pelaksana selama 12 (dua belas) bulan", urutan: 8, durasi_bulan: 12, blokir_kgb: true, blokir_kenaikan_pangkat: true, pasal_rujukan: "Pertor 70/2026 Pasal 8" },
      { kode: "pdhtaps", tingkat: "berat", nama: "pemberhentian dengan hormat tidak atas permintaan sendiri sebagai Pegawai UM", urutan: 9, pasal_rujukan: "Pertor 70/2026 Pasal 8" },
    ],
    pasal: pasalPertor70(),
    ambang: [
      { hari_min: 3, hari_max: 3, tingkat: "ringan", jenis: "teguran_lisan", pasal_rujukan: "Pertor 70/2026 — ketentuan hukuman atas kewajiban masuk kerja", perlu_verifikasi: true },
      { hari_min: 4, hari_max: 6, tingkat: "ringan", jenis: "teguran_tertulis", pasal_rujukan: "Pertor 70/2026 — ketentuan hukuman atas kewajiban masuk kerja", perlu_verifikasi: true },
      { hari_min: 7, hari_max: 10, tingkat: "ringan", jenis: "pernyataan_tidak_puas", pasal_rujukan: "Pertor 70/2026 — ketentuan hukuman atas kewajiban masuk kerja", perlu_verifikasi: true },
      { hari_min: 11, hari_max: 13, tingkat: "sedang", jenis: "tunda_kgb", pasal_rujukan: "Pertor 70/2026 — ketentuan hukuman atas kewajiban masuk kerja", perlu_verifikasi: true },
      { hari_min: 14, hari_max: 16, tingkat: "sedang", jenis: "tunda_kp", pasal_rujukan: "Pertor 70/2026 — ketentuan hukuman atas kewajiban masuk kerja", perlu_verifikasi: true },
      { hari_min: 17, hari_max: 20, tingkat: "sedang", jenis: "turun_pangkat", pasal_rujukan: "Pertor 70/2026 — ketentuan hukuman atas kewajiban masuk kerja", perlu_verifikasi: true },
      { hari_min: 21, hari_max: 24, tingkat: "berat", jenis: "turun_jabatan", pasal_rujukan: "Pertor 70/2026 — ketentuan hukuman atas kewajiban masuk kerja", perlu_verifikasi: true },
      { hari_min: 25, hari_max: 27, tingkat: "berat", jenis: "bebas_jabatan_pelaksana", pasal_rujukan: "Pertor 70/2026 — ketentuan hukuman atas kewajiban masuk kerja", perlu_verifikasi: true },
      { hari_min: 28, hari_max: null, tingkat: "berat", jenis: "pdhtaps", pasal_rujukan: "Pertor 70/2026 — ketentuan hukuman atas kewajiban masuk kerja", perlu_verifikasi: true },
      {
        hari_min: 10, hari_max: null, berturut_turut: true, tingkat: "berat", jenis: "pdhtaps", alur_khusus: "penghentian_gaji",
        akibat_tambahan: "penghentian pembayaran gaji sejak bulan berikutnya, tanpa menunggu keputusan hukuman disiplin",
        pasal_rujukan: "Pertor 70/2026 — tidak masuk kerja 10 hari kerja berturut-turut", perlu_verifikasi: true,
      },
    ],
    tenggat: [
      ...tenggatBersama({
        panggilan1: "Pertor 70/2026 Pasal 16 ayat (3)", panggilan2: "Pertor 70/2026 Pasal 16 ayat (4)", penyampaian: "Pertor 70/2026 Pasal 28 ayat (5)",
        pengiriman: "Pertor 70/2026 Pasal 28 ayat (7)", berlaku: "Pertor 70/2026 Pasal 29 ayat (1)",
      }),
      { kode: "upaya_administratif", nama_tenggat: "Pengingat tindak lanjut upaya administratif", kode_tahap: "upaya_administratif", dihitung_dari: "penyampaian_sk", arah: "sesudah", jumlah: 14, satuan: "hari_kerja", sifat: "pengingat_internal", pasal_rujukan: "Pertor 70/2026 tidak mengatur tenggat upaya administratif", catatan: "Pengingat internal, bukan tenggat hukum." },
    ],
    kewenangan: [
      { tingkat: "ringan", jenis: "pemeriksa", peran_kode: "tim_unit_kerja", nama_peran: "Tim Pemeriksa unit kerja", prioritas: 10, hasil: { bentuk_tim: "wajib" }, pasal_rujukan: "Pertor 70/2026", perlu_verifikasi: true },
      { tingkat: "sedang", jenis: "pemeriksa", peran_kode: "tim_um", nama_peran: "Tim Pemeriksa UM", prioritas: 10, hasil: { bentuk_tim: "wajib" }, pasal_rujukan: "Pertor 70/2026", perlu_verifikasi: true },
      { tingkat: "berat", jenis: "pemeriksa", peran_kode: "tim_um", nama_peran: "Tim Pemeriksa UM", prioritas: 10, hasil: { bentuk_tim: "wajib" }, pasal_rujukan: "Pertor 70/2026", perlu_verifikasi: true },
      { tingkat: "ringan", jenis: "pembentuk_tim", peran_kode: "rektor", nama_peran: "Rektor", syarat_tambahan: { terperiksa_pimpinan_unit: true }, prioritas: 10, pasal_rujukan: "Pertor 70/2026", catatan: "Semua tingkat bagi Wakil Rektor dan pimpinan unit kerja: oleh Rektor.", perlu_verifikasi: true },
      { tingkat: "ringan", jenis: "pembentuk_tim", peran_kode: "pimpinan_unit_kerja", nama_peran: "Pimpinan unit kerja", prioritas: 20, pasal_rujukan: "Pertor 70/2026", perlu_verifikasi: true },
      { tingkat: "sedang", jenis: "pembentuk_tim", peran_kode: "rektor", nama_peran: "Rektor", prioritas: 10, pasal_rujukan: "Pertor 70/2026" },
      { tingkat: "berat", jenis: "pembentuk_tim", peran_kode: "rektor", nama_peran: "Rektor", prioritas: 10, pasal_rujukan: "Pertor 70/2026" },
      { tingkat: "ringan", jenis: "penjatuh", peran_kode: "rektor", nama_peran: "Rektor", syarat_tambahan: { terperiksa_pimpinan_unit: true }, prioritas: 10, pasal_rujukan: "Pertor 70/2026", catatan: "Semua tingkat bagi Wakil Rektor dan pimpinan unit kerja: oleh Rektor.", perlu_verifikasi: true },
      { tingkat: "ringan", jenis: "penjatuh", peran_kode: "pimpinan_unit_kerja", nama_peran: "Pimpinan unit kerja (penerima delegasi)", syarat_tambahan: { unit_punya_delegasi: true }, prioritas: 20, pasal_rujukan: "Pertor 70/2026 Pasal 14 ayat (3)", catatan: "Delegasi hanya kepada: Wakil Rektor (Direktorat & UPT), Sekretaris Universitas, Dekan/Direktur Sekolah Pascasarjana, Ketua LPPM/LPPP, Kepala BPI/BPM/Direktur BPUDA." },
      { tingkat: "ringan", jenis: "penjatuh", peran_kode: "rektor", nama_peran: "Rektor", prioritas: 30, pasal_rujukan: "Pertor 70/2026 Pasal 14 ayat (3)", hasil: { peringatan: "Pimpinan unit kerja ini belum menerima delegasi; kewenangan naik ke Rektor." } },
      { tingkat: "sedang", jenis: "penjatuh", peran_kode: "rektor", nama_peran: "Rektor", prioritas: 10, pasal_rujukan: "Pertor 70/2026 Pasal 14" },
      { tingkat: "berat", jenis: "penjatuh", peran_kode: "rektor", nama_peran: "Rektor", prioritas: 10, pasal_rujukan: "Pertor 70/2026 Pasal 14" },
    ],
    tahapan: tahapanB(),
    pemetaan: pemetaanDampak("Pertor 70/2026 Pasal 9–11"),
    kaidah: [
      { kunci: "hd_ringan_boleh_keberatan", nilai: true },
      { kunci: "satu_pelanggaran_satu_hukuman", nilai: true },
      { kunci: "pemeriksa_ringan", nilai: "tim_pemeriksa_unit_kerja" },
      { kunci: "tim_wajib_untuk", nilai: ["ringan", "sedang", "berat"] },
      { kunci: "hari_berlaku_sk", nilai: { jumlah: 15, satuan: "hari_kerja" }, pasal_rujukan: "Pertor 70/2026 Pasal 29 ayat (1)", catatan: "Informasi. Perhitungan memakai aturan tenggat berkode 'berlaku'." },
      { kunci: "pemotongan_insentif_otomatis", nilai: { tingkat: ["sedang", "berat"] }, pasal_rujukan: "Pertor 70/2026 Pasal 8 ayat (5)", catatan: "Hukuman sedang dan berat otomatis disertai pemotongan insentif kinerja sesuai Peraturan Rektor tentang Insentif Kinerja." },
      { kunci: "keberatan_ditujukan_kepada", nilai: "pejabat_penjatuh" },
      { kunci: "banding_ditujukan_kepada", nilai: "rektor" },
      { kunci: "pemberat_pengulangan", nilai: { berlaku: true } },
      { kunci: "larangan_pindah_unit_saat_status", nilai: ["telaah", "pemeriksaan", "penjatuhan", "penyampaian", "upaya_administratif"] },
      { kunci: "komposisi_tim", nilai: { unsur_wajib: [], jabatan_wajib: ["ketua", "sekretaris", "anggota"] }, perlu_verifikasi: true },
      { kunci: "syarat_jabatan_anggota_tim", nilai: { pembanding: "golongan_ruang", tidak_boleh_lebih_rendah: true }, pasal_rujukan: "Pertor 70/2026", perlu_verifikasi: true },
      {
        kunci: "konsideran_mengingat",
        nilai: ["Peraturan Rektor Universitas Negeri Malang Nomor 70 Tahun 2026 tentang Disiplin Pegawai yang Diangkat oleh Rektor;"],
        perlu_verifikasi: true, catatan: "Lengkapi dengan statuta UM dan peraturan terkait.",
      },
    ],
    fixture: [
      { nama: "Pertor 70/2026: 15 hari TMK → sedang jenis ke-2 (penundaan kenaikan pangkat)", masukan: { jenis: "kehadiran", hari: 15 }, harapan: { tingkat: "sedang", jenis_kode: "tunda_kp" } },
      { nama: "Pertor 70/2026: 5 hari TMK → teguran tertulis", masukan: { jenis: "kehadiran", hari: 5 }, harapan: { tingkat: "ringan", jenis_kode: "teguran_tertulis" } },
      { nama: "Pertor 70/2026: ringan tetap memakai Tim Pemeriksa", masukan: { jenis: "tahapan", tingkat: "ringan" }, harapan: { berisi: ["pembentukan_tim"] } },
      { nama: "Pertor 70/2026: hukuman sedang otomatis pemotongan insentif kinerja", masukan: { jenis: "pemotongan_ik", tingkat: "sedang" }, harapan: { pemotongan_ik: true } },
    ],
  },
];
