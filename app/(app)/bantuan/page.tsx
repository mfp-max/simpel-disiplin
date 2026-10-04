import Link from "next/link";
import {
  Archive, BookOpenCheck, Clock, EyeOff, FilePlus2, FileText, Gavel, HandHeart, Inbox, Keyboard, LifeBuoy, LogOut, Mic, Search,
  ShieldCheck, Sparkles, UserPlus, type LucideIcon,
} from "lucide-react";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Catatan, JudulHalaman, Panel } from "@/components/simpel/dasar";
import { wajibMasuk } from "@/lib/auth";
import { sql } from "@/lib/db";
import { pengaturan } from "@/lib/pengaturan";
import { cn } from "@/lib/utils";

export const metadata = { title: "Bantuan" };

function Langkah({ items }: { items: React.ReactNode[] }) {
  return (
    <ol className="space-y-3">
      {items.map((x, i) => (
        <li key={i} className="flex gap-3">
          <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary text-sm font-bold text-primary-foreground" aria-hidden>{i + 1}</span>
          <div className="min-w-0 pt-1 leading-relaxed">{x}</div>
        </li>
      ))}
    </ol>
  );
}

function Judul({ ikon: Ikon, children }: { ikon: LucideIcon; children: React.ReactNode }) {
  return (
    <span className="flex items-center gap-3 text-base font-semibold">
      <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary"><Ikon className="size-5" aria-hidden /></span>
      {children}
    </span>
  );
}

function Kode({ children }: { children: React.ReactNode }) {
  return <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-[0.9em]">{children}</code>;
}

function Tombol({ children }: { children: React.ReactNode }) {
  return <kbd className="rounded border bg-muted px-1.5 py-0.5 font-mono text-[0.85em] font-semibold shadow-xs">{children}</kbd>;
}

const KELAS = [
  { ikon: Inbox, judul: "Registrasi Informasi", warna: "bg-arsip-muda text-arsip", isi: "Surat, laporan lisan, disposisi, atau temuan yang belum menjadi perkara. Wajib dicatat agar tidak hilang, tetapi tidak dihitung dalam angka kasus, tenggat, maupun statistik." },
  { ikon: Gavel, judul: "Kasus Hukdis", warna: "bg-info-muda text-info", isi: "Kasus hukuman disiplin yang berjalan mengikuti tahapan penuh — dari telaah sampai selesai menjalani hukuman — lengkap dengan tenggat." },
  { ikon: HandHeart, judul: "Pembinaan", warna: "bg-aman-muda text-aman", isi: "Teguran pembinaan, pelanggaran kode etik, konseling. Dicatat ringkas tanpa tahapan pemeriksaan dan tanpa SK hukuman disiplin." },
  { ikon: Archive, judul: "Arsip Lampau", warna: "bg-secondary text-secondary-foreground", isi: "Kasus yang selesai sebelum SIMPEL ada. Berkas boleh tidak lengkap; cukup nama pegawai, tahun, dan uraian singkat." },
];

const TAHAP = ["Informasi masuk", "Naikkan jadi kasus", "Telaah", "Tim pemeriksa (bila sedang/berat)", "Surat panggilan I (dan II bila tidak hadir)", "Pemeriksaan & BAP", "Laporan hasil pemeriksaan", "Penetapan keputusan hukuman", "Penyampaian keputusan", "Berlaku hari kerja ke-15", "Menjalani hukuman (sedang/berat)", "Selesai"];

const PLACEHOLDER = [
  ["{nama_terperiksa}", "Nama lengkap dengan gelar"], ["{nip_terperiksa}", "NIP"], ["{pangkat_terperiksa}", "Pangkat"], ["{golongan_terperiksa}", "Golongan ruang"],
  ["{jabatan_terperiksa}", "Jabatan"], ["{unit_kerja_terperiksa}", "Unit kerja"], ["{nomor_registrasi}", "Nomor registrasi kasus"], ["{uraian_dugaan}", "Uraian dugaan pelanggaran"],
  ["{pasal_dilanggar}", "Pasal yang dilanggar (otomatis dari katalog)"], ["{nama_regulasi}", "Nama peraturan"], ["{nomor_surat}", "Nomor surat"], ["{tanggal_surat_panjang}", "mis. 4 Oktober 2026"],
  ["{hari_pemeriksaan}", "Hari pemeriksaan"], ["{tanggal_pemeriksaan_terbilang}", "Tanggal dalam huruf"], ["{jam_pemeriksaan}", "Jam pemeriksaan"], ["{tempat_pemeriksaan}", "Tempat pemeriksaan"],
  ["{nama_rektor}", "Nama Rektor (dari Pengaturan umum)"], ["{nip_rektor}", "NIP Rektor"], ["{#anggota_tim}…{/anggota_tim}", "Perulangan anggota tim pemeriksa"], ["{#qa}…{/qa}", "Perulangan tanya jawab BAP"],
];

export default async function HalamanBantuan() {
  const p = await wajibMasuk();
  const [admin, idle, ambang] = await Promise.all([
    sql`select u.nama, u.email, u.jabatan from app_users u join peran r on r.kode = u.peran_kode where u.aktif and r.kelola_pengaturan order by u.nama`,
    pengaturan<number>("batas_idle_menit", 30),
    pengaturan<number>("ambang_peringatan_tenggat_hari", 3),
  ]);
  const n = Number(ambang) || 3;
  const menit = Number(idle) || 30;

  return (
    <>
      <JudulHalaman judul="Bantuan" deskripsi="Panduan singkat memakai SIMPEL — Sistem Informasi Manajemen Pelanggaran Universitas Negeri Malang." />

      <Panel className="mb-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
          <span className="flex size-14 shrink-0 items-center justify-center rounded-2xl bg-primary text-primary-foreground"><Sparkles className="size-7" aria-hidden /></span>
          <div className="space-y-1">
            <p className="text-lg font-semibold">Apa itu SIMPEL?</p>
            <p className="leading-relaxed text-muted-foreground">
              SIMPEL membantu Direktorat SDMK mencatat setiap dugaan pelanggaran disiplin pegawai, menjalankan tahapan pemeriksaan sesuai peraturan,
              menghitung tenggat dalam hari kerja, dan membuat surat-surat resmi secara otomatis — semuanya tercatat dan bersifat rahasia.
            </p>
          </div>
        </div>
      </Panel>

      <section className="mb-6" aria-labelledby="kelas">
        <h2 id="kelas" className="mb-3 text-lg font-semibold">Empat jenis catatan</h2>
        <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {KELAS.map((k) => (
            <li key={k.judul} className="rounded-xl border bg-card p-4 shadow-sm">
              <span className={cn("mb-3 flex size-11 items-center justify-center rounded-lg", k.warna)}><k.ikon className="size-6" aria-hidden /></span>
              <p className="font-semibold">{k.judul}</p>
              <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{k.isi}</p>
            </li>
          ))}
        </ul>
      </section>

      <Panel judul="Panduan langkah demi langkah" className="mb-6">
        <Accordion type="multiple" className="w-full">
          <AccordionItem value="alur">
            <AccordionTrigger><Judul ikon={Gavel}>Bagaimana sebuah kasus berjalan</Judul></AccordionTrigger>
            <AccordionContent className="space-y-4 text-[15px]">
              <p>Setiap kasus hukuman disiplin melewati tahapan berikut. SIMPEL hanya menampilkan tahap yang relevan menurut status pegawai (ASN atau pegawai yang diangkat Rektor) dan tingkat hukuman.</p>
              <ol className="flex flex-wrap items-center gap-2">
                {TAHAP.map((t, i) => (
                  <li key={t} className="flex items-center gap-2">
                    <span className="rounded-full border bg-card px-3 py-1.5 text-sm"><span className="font-semibold text-primary">{i + 1}.</span> {t}</span>
                    {i < TAHAP.length - 1 && <span className="text-muted-foreground" aria-hidden>→</span>}
                  </li>
                ))}
              </ol>
              <p>Di halaman kasus, buka tahap yang sedang berjalan, isi tanggal realisasinya, unggah dokumen, lalu tekan <strong>Selesaikan tahap</strong>. Tahap berikutnya dan tenggatnya muncul otomatis.
                Ikon <strong>tanda tanya</strong> di tiap tahap menampilkan pasal yang menjadi dasarnya.</p>
              <p>Cabang khusus seperti upaya administratif (keberatan/banding), pembebasan sementara, dan penghentian kasus tersedia dari menu tindakan di halaman kasus.</p>
            </AccordionContent>
          </AccordionItem>

          <AccordionItem value="tenggat">
            <AccordionTrigger><Judul ikon={Clock}>Arti warna tenggat</Judul></AccordionTrigger>
            <AccordionContent className="space-y-3 text-[15px]">
              <p>Semua tenggat dihitung dalam <strong>hari kerja</strong> — Sabtu, Minggu, libur nasional, dan cuti bersama tidak dihitung.</p>
              <ul className="grid gap-2 sm:grid-cols-2">
                <li className="flex items-center gap-3 rounded-lg bg-aman-muda p-3"><span className="size-4 rounded-full bg-aman" aria-hidden /> <span><strong className="text-aman">Hijau</strong> — masih lebih dari {n} hari kerja</span></li>
                <li className="flex items-center gap-3 rounded-lg bg-waspada-muda p-3"><span className="size-4 rounded-full bg-waspada" aria-hidden /> <span><strong className="text-waspada">Kuning</strong> — tinggal 1–{n} hari kerja, segera tindak lanjuti</span></li>
                <li className="flex items-center gap-3 rounded-lg bg-lewat-muda p-3"><span className="size-4 rounded-full bg-lewat" aria-hidden /> <span><strong className="text-lewat">Merah</strong> — tenggat sudah lewat</span></li>
                <li className="flex items-center gap-3 rounded-lg bg-arsip-muda p-3"><span className="size-4 rounded-full bg-arsip" aria-hidden /> <span><strong className="text-arsip">Abu-abu</strong> — tahap sudah selesai atau catatan arsip</span></li>
              </ul>
              <p className="text-sm text-muted-foreground">Ketepatan tenggat bergantung pada kalender hari libur. Admin wajib melengkapi kalender tahun berikutnya di Pengaturan → Hari libur.</p>
            </AccordionContent>
          </AccordionItem>

          <AccordionItem value="privasi">
            <AccordionTrigger><Judul ikon={EyeOff}>Mode privasi (saat rapat atau presentasi)</Judul></AccordionTrigger>
            <AccordionContent className="space-y-2 text-[15px]">
              <p>Tekan ikon <strong>mata</strong> di bagian atas layar. Semua nama dan NIP pegawai akan disamarkan sehingga layar aman ditampilkan di proyektor atau dilihat orang lain.</p>
              <p>Tekan sekali lagi untuk menampilkan kembali. Mode privasi hanya mengubah tampilan, tidak mengubah data.</p>
            </AccordionContent>
          </AccordionItem>

          <AccordionItem value="sidang">
            <AccordionTrigger><Judul ikon={Mic}>Mode sidang (mencatat saat pemeriksaan)</Judul></AccordionTrigger>
            <AccordionContent className="text-[15px]">
              <Langkah items={[
                <>Dari tahap <strong>Pemeriksaan</strong> di halaman kasus, buka <strong>Mode sidang</strong>. Layar ini nyaman dipakai di laptop maupun tablet.</>,
                <>Identitas terperiksa dan tim terisi otomatis. Tandai kehadiran.</>,
                <>17 pertanyaan baku sudah tersedia. Ketik jawaban per nomor — tersimpan otomatis setiap beberapa detik, dengan keterangan &quot;tersimpan pukul …&quot;.</>,
                <>Tekan <strong>+ Pertanyaan substansi</strong> untuk menyisipkan pertanyaan, atau ambil dari <strong>bank pertanyaan</strong>. Nomor menyesuaikan sendiri.</>,
                <>Rekaman audio hanya bisa dinyalakan setelah persetujuan tertulis terperiksa diunggah. Bila terperiksa menolak, pemeriksaan tetap berjalan tanpa rekaman.</>,
                <>Tekan <strong>Selesai &amp; Susun BAP</strong> untuk menghasilkan Berita Acara Pemeriksaan lengkap dalam format Word.</>,
              ]} />
              <p className="mt-3 text-sm text-muted-foreground">Jika internet terputus, ketikan disimpan sementara di perangkat dan dikirim begitu sambungan pulih.</p>
            </AccordionContent>
          </AccordionItem>

          <AccordionItem value="dokumen">
            <AccordionTrigger><Judul ikon={FileText}>Membuat surat dan dokumen</Judul></AccordionTrigger>
            <AccordionContent className="text-[15px]">
              <Langkah items={[
                <>Di halaman kasus, setiap tahap menampilkan tombol dokumen yang sesuai (mis. <em>Surat Panggilan I</em> pada tahap panggilan).</>,
                <>Tekan tombolnya. SIMPEL mengisi otomatis semua data yang sudah ada: nama, NIP, pangkat, pasal, nama Rektor, dan lainnya.</>,
                <>Lengkapi isian yang masih kosong saja (mis. nomor surat), lalu lihat pratinjaunya.</>,
                <>Tekan <strong>Unduh .docx</strong>. Berkas Word bisa disunting sedikit bila perlu, lalu dicetak. Setiap dokumen diberi tanda RAHASIA dan tercatat.</>,
              ]} />
            </AccordionContent>
          </AccordionItem>

          <AccordionItem value="template">
            <AccordionTrigger><Judul ikon={FilePlus2}>Cara menambah template surat baru</Judul></AccordionTrigger>
            <AccordionContent className="space-y-4 text-[15px]">
              <p>Template adalah berkas Word biasa yang diberi <strong>penanda</strong> di dalam kurung kurawal, mis. <Kode>{"{nama_terperiksa}"}</Kode>. Saat dokumen dibuat, penanda diganti data kasus. Kop, tabel, dan spasi tetap persis seperti berkas aslinya.</p>
              <Langkah items={[
                <><strong>Siapkan berkas di Word.</strong> Buka surat contoh yang sudah benar, lalu ganti bagian yang berubah-ubah dengan penanda, mis. <Kode>{"Nama : {nama_terperiksa}"}</Kode>. Simpan sebagai <Kode>.docx</Kode> (bukan .doc).</>,
                <><strong>Unggah.</strong> Buka Pengaturan → Template dokumen → <strong>Tambah</strong>, lalu pilih berkasnya.</>,
                <><strong>Pindai.</strong> SIMPEL menampilkan semua penanda yang ditemukan. Penanda yang salah ketik akan terlihat di sini.</>,
                <><strong>Petakan.</strong> Untuk tiap penanda, pilih sumber datanya dari daftar, atau tandai sebagai <em>isian manual</em> bila harus diketik pengguna saat membuat surat.</>,
                <><strong>Lengkapi keterangan:</strong> jenis dokumen, rezim (ASN/pegawai Rektor/keduanya), tingkat hukuman, dan tahap kasus tempat template muncul.</>,
                <><strong>Uji.</strong> Tekan <strong>Uji</strong> untuk mengunduh contoh berisi data rekaan. Periksa tata letaknya di Word.</>,
                <><strong>Aktifkan.</strong> Setelah benar, aktifkan. Mengunggah ulang template yang sama membuat versi baru; dokumen lama tetap bisa dibuat ulang persis seperti dulu.</>,
              ]} />
              <div>
                <p className="mb-2 font-semibold">Penanda yang sering dipakai</p>
                <div className="grid gap-x-6 gap-y-1.5 sm:grid-cols-2">
                  {PLACEHOLDER.map(([k, v]) => (
                    <div key={k} className="flex flex-wrap items-baseline gap-x-2 text-sm"><Kode>{k}</Kode><span className="text-muted-foreground">{v}</span></div>
                  ))}
                </div>
                <p className="mt-2 text-sm text-muted-foreground">Daftar lengkap tersedia di layar pemetaan template. Penanda perulangan (diawali <Kode>#</Kode> dan diakhiri <Kode>/</Kode>) biasanya diletakkan di satu baris tabel.</p>
              </div>
              <Catatan jenis="waspada">Ketik penanda dalam satu kali ketik tanpa mengubah format di tengahnya (mis. sebagian huruf tebal), agar Word tidak memecahnya dan SIMPEL dapat membacanya.</Catatan>
            </AccordionContent>
          </AccordionItem>

          <AccordionItem value="regulasi">
            <AccordionTrigger><Judul ikon={BookOpenCheck}>Menambah peraturan disiplin baru (tanpa programmer)</Judul></AccordionTrigger>
            <AccordionContent className="space-y-3 text-[15px]">
              <p>Aturan hukum disimpan sebagai data, sehingga peraturan baru cukup dimasukkan lewat wizard di Pengaturan → Peraturan &amp; katalog aturan → <strong>Tambah peraturan baru</strong>:</p>
              <Langkah items={[
                <><strong>Identitas</strong> — nomor, tahun, judul, rezim, tanggal berlaku, dan peraturan yang digantikan.</>,
                <><strong>Salin dari peraturan lama</strong> — semua tingkat, jenis hukuman, ambang, tenggat, dan kewenangan tersalin untuk disunting.</>,
                <><strong>Sunting kewajiban dan larangan</strong> — pasal, ayat, huruf, dan bunyinya.</>,
                <><strong>Sunting tingkat, jenis hukuman, ambang kehadiran, tenggat, dan kewenangan.</strong></>,
                <><strong>Uji dengan kasus contoh</strong> — mis. &quot;golongan III/b tidak masuk 18 hari&quot;; periksa hasilnya terhadap bunyi peraturan.</>,
                <><strong>Aktifkan</strong> dengan tanggal mulai berlaku. Kasus lama tidak tersentuh; kasus baru otomatis memakai aturan baru.</>,
              ]} />
              <p>Setiap peraturan juga punya halaman <strong>ringkasan</strong> yang dapat dibaca semua pengguna untuk verifikasi oleh bagian hukum.</p>
            </AccordionContent>
          </AccordionItem>

          <AccordionItem value="pengguna">
            <AccordionTrigger><Judul ikon={UserPlus}>Menambah pengguna (khusus admin)</Judul></AccordionTrigger>
            <AccordionContent className="text-[15px]">
              <Langkah items={[
                <>Buka Pengaturan → <strong>Pengguna</strong> → <strong>Tambah pengguna</strong>.</>,
                <>Isi email, nama, jabatan, dan peran. Email otomatis dimasukkan ke daftar izin login.</>,
                <>Beri tahu pengguna untuk membuka SIMPEL dan masuk dengan <strong>Google</strong> (alamat email harus sama persis) atau dengan <strong>email + kata sandi</strong>.</>,
                <>Saat pertama masuk, pengguna diminta memasang <strong>verifikasi dua langkah</strong>. Ini wajib untuk keamanan data rahasia.</>,
                <>Bila seseorang pindah tugas, tekan <strong>Nonaktifkan</strong> — aksesnya langsung berhenti, riwayatnya tetap tersimpan.</>,
              ]} />
            </AccordionContent>
          </AccordionItem>

          <AccordionItem value="cari">
            <AccordionTrigger><Judul ikon={Search}>Pencarian cepat</Judul></AccordionTrigger>
            <AccordionContent className="space-y-2 text-[15px]">
              <p>Tekan <Tombol>Ctrl</Tombol> + <Tombol>K</Tombol> (di Mac: <Tombol>⌘</Tombol> + <Tombol>K</Tombol>) dari halaman mana pun, atau ketuk kotak cari di bagian atas.</p>
              <p>Cari dengan nama pegawai, NIP, nomor registrasi, nomor surat, atau kata di dalam berkas yang sudah dibaca teksnya.</p>
            </AccordionContent>
          </AccordionItem>

          <AccordionItem value="keluar">
            <AccordionTrigger><Judul ikon={LogOut}>Keluar otomatis</Judul></AccordionTrigger>
            <AccordionContent className="space-y-2 text-[15px]">
              <p>Demi kerahasiaan, SIMPEL otomatis keluar setelah <strong>{menit} menit</strong> tidak ada aktivitas. Sebelumnya muncul peringatan agar Anda bisa melanjutkan.</p>
              <p>Formulir panjang dan mode sidang menyimpan otomatis, jadi ketikan tidak hilang. Selalu tekan <strong>Keluar</strong> bila memakai komputer bersama.</p>
            </AccordionContent>
          </AccordionItem>

          <AccordionItem value="keamanan">
            <AccordionTrigger><Judul ikon={ShieldCheck}>Kerahasiaan dan jejak audit</Judul></AccordionTrigger>
            <AccordionContent className="space-y-2 text-[15px]">
              <p>Dokumen pemeriksaan dan hukuman disiplin bersifat <strong>rahasia</strong>. Semua pengguna dapat melihat semua kasus, karena itu setiap kali kasus dibuka, diubah, diunduh, atau dicetak, SIMPEL mencatat siapa dan kapan.</p>
              <p>Catatan ini tidak dapat diubah atau dihapus oleh siapa pun{p.hak.boleh_lihat_audit || p.hak.kelola_pengaturan ? <>, dan dapat dilihat di <Link className="text-primary underline underline-offset-4" href="/pengaturan/audit">Log audit</Link></> : null}.</p>
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      </Panel>

      <Panel judul="Pertanyaan yang sering diajukan" className="mb-6">
        <Accordion type="single" collapsible className="w-full">
          {[
            ["Saya tidak bisa masuk, muncul \"Akses belum diberikan\".", "Email Anda belum terdaftar atau sudah dinonaktifkan. Hubungi admin agar email Anda ditambahkan di Pengaturan → Pengguna. Pastikan Anda masuk dengan email yang sama persis."],
            ["Apakah surat masuk yang belum jelas harus dicatat?", "Ya. Catat sebagai Registrasi Informasi. Informasi tidak dihitung dalam statistik dan tidak memunculkan tenggat sampai dinaikkan menjadi kasus."],
            ["Kapan informasi bisa dinaikkan menjadi kasus?", "Setelah pegawai terlapor teridentifikasi dan ada sedikitnya pelapor bernama, bukti yang diunggah, atau rekap kehadiran."],
            ["Saya salah mengisi data. Bisakah dihapus?", "Data tidak dihapus permanen. Ubah isinya, atau arsipkan dengan alasan tertulis. Semua perubahan tercatat."],
            ["Tenggat yang tampil terasa keliru.", "Periksa kalender hari libur tahun tersebut — biasanya cuti bersama belum dimasukkan. Setelah kalender diperbaiki, tenggat dihitung ulang otomatis saat kasus dibuka kembali."],
            ["Apakah dokumen yang sudah dibuat ikut berubah bila template diganti?", "Tidak. Dokumen lama tetap memakai versi template saat dibuat, sehingga dapat dibuat ulang persis seperti aslinya."],
            ["Bisakah dipakai di ponsel?", "Bisa. Semua halaman menyesuaikan layar ponsel dan tablet. Mode sidang paling nyaman di tablet atau laptop."],
          ].map(([t, j], i) => (
            <AccordionItem key={i} value={`faq-${i}`}>
              <AccordionTrigger className="text-[15px]">{t}</AccordionTrigger>
              <AccordionContent className="text-[15px] leading-relaxed text-muted-foreground">{j}</AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      </Panel>

      <Panel judul={<span className="flex items-center gap-2"><LifeBuoy className="size-5" aria-hidden /> Butuh bantuan lebih lanjut?</span>}>
        <p className="mb-3 text-[15px]">Hubungi admin SIMPEL di Direktorat SDMK:</p>
        {admin.length ? (
          <ul className="space-y-2">
            {admin.map((a) => (
              <li key={a.email} className="flex flex-col rounded-lg border p-3 sm:flex-row sm:items-center sm:justify-between">
                <span><span className="font-semibold">{a.nama}</span>{a.jabatan ? <span className="text-muted-foreground"> · {a.jabatan}</span> : null}</span>
                <a className="inline-flex min-h-11 items-center break-all text-primary underline underline-offset-4" href={`mailto:${a.email}`}>{a.email}</a>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-muted-foreground">Belum ada admin aktif.</p>
        )}
        <p className="mt-3 flex items-start gap-2 text-sm text-muted-foreground"><Keyboard className="mt-0.5 size-4 shrink-0" aria-hidden /> Saat melapor masalah, sebutkan halaman yang dibuka dan pesan yang muncul. Jangan kirim tangkapan layar berisi nama atau NIP pegawai — aktifkan mode privasi lebih dulu.</p>
      </Panel>
    </>
  );
}
