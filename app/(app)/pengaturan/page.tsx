import Link from "next/link";
import {
  BookOpenCheck, Building2, CalendarDays, ChevronRight, FileSpreadsheet, FileText, HelpCircle, ListChecks, Lock, MessagesSquare,
  ScrollText, Settings2, ShieldCheck, Tags, UserCog, Users, Medal, type LucideIcon,
} from "lucide-react";
import { JudulHalaman, Catatan } from "@/components/simpel/dasar";
import { Lencana } from "@/components/simpel/lencana";
import { wajibMasuk } from "@/lib/auth";
import { sql } from "@/lib/db";
import { pengaturan } from "@/lib/pengaturan";

export const metadata = { title: "Pengaturan" };

type Kartu = { href: string; judul: string; keterangan: string; ikon: LucideIcon; akses: "admin" | "audit" | "semua" };

const KELOMPOK: { judul: string; kartu: Kartu[] }[] = [
  {
    judul: "Pengguna & keamanan",
    kartu: [
      { href: "/pengaturan/pengguna", judul: "Pengguna", keterangan: "Tambah, ubah, dan nonaktifkan pengguna; sinkron dengan daftar izin login.", ikon: Users, akses: "admin" },
      { href: "/pengaturan/peran", judul: "Peran & hak akses", keterangan: "Atur apa yang boleh dilakukan tiap peran.", ikon: ShieldCheck, akses: "admin" },
      { href: "/pengaturan/audit", judul: "Log audit", keterangan: "Jejak siapa membuka, mengubah, dan mengunduh apa.", ikon: ScrollText, akses: "audit" },
    ],
  },
  {
    judul: "Aturan & dokumen",
    kartu: [
      { href: "/pengaturan/regulasi", judul: "Peraturan & katalog aturan", keterangan: "Peraturan disiplin, tingkat & jenis hukuman, tenggat, kewenangan.", ikon: BookOpenCheck, akses: "semua" },
      { href: "/pengaturan/template", judul: "Template dokumen", keterangan: "Unggah surat .docx berpenanda {placeholder}, petakan, uji, aktifkan.", ikon: FileText, akses: "admin" },
      { href: "/pengaturan/pertanyaan", judul: "Pertanyaan pemeriksaan", keterangan: "Pertanyaan baku BAP dan bank pertanyaan untuk mode sidang.", ikon: MessagesSquare, akses: "admin" },
      { href: "/pengaturan/hari-libur", judul: "Hari libur", keterangan: "Kalender libur nasional & cuti bersama untuk menghitung tenggat.", ikon: CalendarDays, akses: "admin" },
    ],
  },
  {
    judul: "Data induk",
    kartu: [
      { href: "/pengaturan/impor", judul: "Impor data pegawai", keterangan: "Impor rekap Excel Simpega dengan pemetaan kolom.", ikon: FileSpreadsheet, akses: "admin" },
      { href: "/pengaturan/unit-kerja", judul: "Unit kerja", keterangan: "Susunan unit kerja dan penerima delegasi kewenangan.", ikon: Building2, akses: "admin" },
      { href: "/pengaturan/status-pegawai", judul: "Pemetaan status pegawai", keterangan: "Status kepegawaian Simpega → rezim aturan yang berlaku.", ikon: UserCog, akses: "admin" },
      { href: "/pengaturan/golongan", judul: "Golongan ruang", keterangan: "Urutan golongan/pangkat untuk membandingkan jenjang pemeriksa.", ikon: Medal, akses: "admin" },
      { href: "/pengaturan/referensi", judul: "Kode referensi", keterangan: "Pilihan isian: sumber informasi, jenis dokumen, unsur tim, dll.", ikon: Tags, akses: "admin" },
      { href: "/pengaturan/umum", judul: "Pengaturan umum", keterangan: "Identitas instansi, Nama & NIP Rektor, batas waktu sesi, retensi.", ikon: Settings2, akses: "admin" },
    ],
  },
];

export default async function HalamanPengaturan() {
  const p = await wajibMasuk();
  const admin = p.hak.kelola_pengaturan;
  const boleh = (k: Kartu) => k.akses === "semua" || admin || (k.akses === "audit" && p.hak.boleh_lihat_audit);

  // Hal yang perlu perhatian admin
  const perhatian: { teks: string; href: string }[] = [];
  if (admin) {
    const tahunDepan = Number(new Date(Date.now() + 7 * 3600 * 1000).getUTCFullYear()) + 1;
    const [[{ n }], rektor, nip] = await Promise.all([
      sql`select count(*)::int as n from hari_libur where tanggal between ${`${tahunDepan}-01-01`} and ${`${tahunDepan}-12-31`}`,
      pengaturan<string>("nama_rektor", ""),
      pengaturan<string>("nip_rektor", ""),
    ]);
    if (n < 10) perhatian.push({ teks: `Kalender hari libur tahun ${tahunDepan} baru berisi ${n} tanggal — perhitungan tenggat bisa keliru.`, href: `/pengaturan/hari-libur?tahun=${tahunDepan}` });
    if (!String(rektor).trim() || !String(nip).trim()) perhatian.push({ teks: "Nama dan/atau NIP Rektor belum diisi — dokumen yang ditandatangani Rektor akan kosong.", href: "/pengaturan/umum" });
  }

  return (
    <>
      <JudulHalaman
        judul="Pengaturan"
        deskripsi={admin ? "Semua pengaturan SIMPEL dapat diubah dari sini tanpa bantuan programmer. Setiap perubahan tercatat di log audit." : "Sebagian besar pengaturan hanya dapat diubah oleh admin. Berikut bagian yang dapat Anda buka."}
      />

      {perhatian.length > 0 && (
        <div className="mb-6 space-y-2">
          {perhatian.map((x) => (
            <Catatan key={x.href} jenis="waspada" judul="Perlu perhatian">
              {x.teks}{" "}
              <Link href={x.href} className="font-semibold text-primary underline underline-offset-4">Perbaiki sekarang</Link>
            </Catatan>
          ))}
        </div>
      )}

      <div className="space-y-8">
        {KELOMPOK.map((g) => {
          const kartu = g.kartu.filter(boleh);
          const terkunci = admin ? [] : g.kartu.filter((k) => !boleh(k));
          if (!kartu.length && !terkunci.length) return null;
          return (
            <section key={g.judul} aria-labelledby={`k-${g.judul}`}>
              <h2 id={`k-${g.judul}`} className="mb-3 text-lg font-semibold">{g.judul}</h2>
              <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {kartu.map((k) => (
                  <li key={k.href}>
                    <Link
                      href={k.href}
                      className="group flex h-full min-h-24 items-start gap-4 rounded-xl border bg-card p-4 shadow-sm transition-colors hover:border-primary/50 hover:bg-accent/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      <span className="flex size-11 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                        <k.ikon className="size-6" aria-hidden />
                      </span>
                      <span className="min-w-0 flex-1 space-y-1">
                        <span className="flex flex-wrap items-center gap-2 font-semibold">
                          {k.judul}
                          {k.akses === "admin" && <Lencana>Admin</Lencana>}
                          {k.akses === "semua" && !admin && <Lencana warna="info">Baca saja</Lencana>}
                        </span>
                        <span className="block text-sm text-muted-foreground">{k.keterangan}</span>
                      </span>
                      <ChevronRight className="mt-3 size-5 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" aria-hidden />
                    </Link>
                  </li>
                ))}
                {terkunci.map((k) => (
                  <li key={k.href} className="flex min-h-24 items-start gap-4 rounded-xl border border-dashed bg-card/60 p-4 text-muted-foreground">
                    <span className="flex size-11 shrink-0 items-center justify-center rounded-lg bg-secondary">
                      <Lock className="size-5" aria-hidden />
                    </span>
                    <span className="min-w-0 space-y-1">
                      <span className="block font-semibold">{k.judul}</span>
                      <span className="block text-sm">Hanya admin.</span>
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          );
        })}

        <section>
          <h2 className="mb-3 text-lg font-semibold">Bantuan</h2>
          <Link href="/bantuan" className="flex min-h-16 items-center gap-4 rounded-xl border bg-card p-4 shadow-sm hover:bg-accent/40 sm:max-w-xl">
            <span className="flex size-11 shrink-0 items-center justify-center rounded-lg bg-info-muda text-info">
              <HelpCircle className="size-6" aria-hidden />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block font-semibold">Panduan pemakaian SIMPEL</span>
              <span className="block text-sm text-muted-foreground">Termasuk cara menambah template surat dan peraturan baru.</span>
            </span>
            <ListChecks className="size-5 text-muted-foreground" aria-hidden />
          </Link>
        </section>
      </div>
    </>
  );
}
