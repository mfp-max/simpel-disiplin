import Link from "next/link";
import type { Metadata } from "next";
import {
  AlarmClock, AlertTriangle, Archive, CalendarClock, CheckCircle2, ChevronRight, Gavel, Inbox, KanbanSquare, UserRoundSearch,
} from "lucide-react";
import { wajibMasuk } from "@/lib/auth";
import { ambilBeranda, type DataBeranda, type KolomKanban } from "@/lib/laporan";
import { namaHari, tanggalPanjang, tanggalPendek, angka } from "@/lib/format";
import { Catatan, Kosong, Panel, Pii } from "@/components/simpel/dasar";
import { Lencana, LencanaTenggat } from "@/components/simpel/lencana";
import { cn } from "@/lib/utils";
import { GrafikBatang, GrafikTren } from "./grafik_klien";

export const metadata: Metadata = { title: "Beranda — SIMPEL" };
export const dynamic = "force-dynamic";

function salam() {
  const jam = new Date(Date.now() + 7 * 3600 * 1000).getUTCHours();
  if (jam < 11) return "Selamat pagi";
  if (jam < 15) return "Selamat siang";
  if (jam < 18) return "Selamat sore";
  return "Selamat malam";
}

export default async function Beranda({ searchParams }: { searchParams: Promise<{ galat?: string }> }) {
  const [p, sp] = await Promise.all([wajibMasuk(), searchParams]);
  const d = await ambilBeranda();
  const r = d.ringkasan;

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <p className="text-sm font-medium text-muted-foreground">
          {namaHari(d.hariIni)}, {tanggalPanjang(d.hariIni)}
        </p>
        <h1 className="text-2xl font-bold tracking-tight sm:text-[1.7rem]">
          {salam()}, <Pii>{p.nama}</Pii>
        </h1>
        <p className="text-muted-foreground">Ringkasan penanganan kasus hukuman disiplin hari ini.</p>
      </header>

      {sp.galat === "hak" && <Catatan jenis="waspada" judul="Akses dibatasi">Halaman yang Anda buka hanya untuk pengguna dengan hak mengelola pengaturan.</Catatan>}

      {/* Kartu ringkas */}
      <section aria-labelledby="judul-ringkasan">
        <h2 id="judul-ringkasan" className="sr-only">Ringkasan angka</h2>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <KartuAngka href="/kasus" ikon={Gavel} label="Kasus aktif" nilai={r.aktif} keterangan="Kasus hukdis sedang diproses" />
          <KartuAngka href="#tenggat" ikon={AlarmClock} label="Mendekati tenggat" nilai={r.mendekati} keterangan={`≤ ${d.ambangHari} hari kerja lagi`} warna={r.mendekati ? "waspada" : undefined} />
          <KartuAngka href="#tenggat" ikon={AlertTriangle} label="Lewat tenggat" nilai={r.lewat} keterangan="Kasus dengan tahap terlambat" warna={r.lewat ? "lewat" : undefined} />
          <KartuAngka href="/laporan/rekapitulasi" ikon={CheckCircle2} label="Selesai tahun ini" nilai={r.selesaiTahunIni} keterangan={`Kasus hukdis tuntas ${d.hariIni.slice(0, 4)}`} warna={r.selesaiTahunIni ? "aman" : undefined} />
        </div>
        <div className="mt-3 flex flex-col gap-3 sm:flex-row">
          <Link
            href="/informasi"
            className="group flex min-h-16 flex-1 items-center gap-3 rounded-xl border border-dashed border-info/40 bg-info-muda/60 px-4 py-3 transition-colors hover:bg-info-muda"
          >
            <Inbox className="size-6 shrink-0 text-info" aria-hidden />
            <span className="min-w-0 flex-1">
              <span className="block font-semibold">
                Informasi belum berproses: <span className="tabular-nums">{angka(r.informasi)}</span>
              </span>
              <span className="block text-sm text-muted-foreground">Tidak dihitung dalam angka kasus, tenggat, maupun statistik sampai dinaikkan menjadi kasus.</span>
            </span>
            <ChevronRight className="size-5 shrink-0 text-muted-foreground group-hover:translate-x-0.5" aria-hidden />
          </Link>
          <Link href="/arsip" className="flex min-h-16 items-center gap-3 rounded-xl border bg-card px-4 py-3 text-sm hover:bg-accent sm:w-64">
            <Archive className="size-5 shrink-0 text-arsip" aria-hidden />
            <span>
              <span className="block font-medium">Arsip lampau: <span className="tabular-nums">{angka(r.arsip)}</span></span>
              <span className="block text-xs text-muted-foreground">Statistik historis, di luar angka di atas</span>
            </span>
          </Link>
        </div>
      </section>

      {/* Kanban */}
      <Panel
        judul={<span className="inline-flex items-center gap-2"><KanbanSquare className="size-5 text-primary" aria-hidden /> Papan tahapan kasus</span>}
        deskripsi="Kasus hukuman disiplin yang berjalan, dikelompokkan menurut status."
        aksi={<Link href="/kasus" className="inline-flex min-h-11 items-center text-sm font-medium text-primary hover:underline">Semua kasus</Link>}
      >
        {r.aktif === 0 ? (
          <Kosong ikon={Gavel} judul="Belum ada kasus yang berjalan" deskripsi="Kasus hukuman disiplin yang dibuat atau dinaikkan dari Registrasi Informasi akan muncul di papan ini." />
        ) : (
          <Kanban kolom={d.kanban} />
        )}
      </Panel>

      <div className="grid gap-6 xl:grid-cols-5">
        {/* Tenggat terdekat */}
        <Panel
          id="tenggat"
          className="xl:col-span-3"
          judul={<span className="inline-flex items-center gap-2"><CalendarClock className="size-5 text-primary" aria-hidden /> Tenggat terdekat</span>}
          deskripsi="Tahap yang lewat tenggat dan yang jatuh tempo dalam 14 hari ke depan."
        >
          <DaftarTenggat d={d} />
        </Panel>

        {/* Ambang kehadiran */}
        <Panel
          className="xl:col-span-2"
          judul={<span className="inline-flex items-center gap-2"><UserRoundSearch className="size-5 text-primary" aria-hidden /> Pegawai mendekati ambang kehadiran</span>}
          deskripsi={`Akumulasi tidak masuk kerja ${d.kehadiran.tahun}, tinggal ≤ ${d.kehadiran.margin} hari dari ambang berikutnya.`}
        >
          <DaftarKehadiran d={d} />
        </Panel>
      </div>

      {/* Grafik */}
      <section aria-labelledby="judul-grafik" className="space-y-3">
        <div>
          <h2 id="judul-grafik" className="text-lg font-semibold">Statistik kasus</h2>
          <p className="text-sm text-muted-foreground">
            {angka(d.grafik.totalKasus)} kasus hukuman disiplin. Registrasi informasi dan arsip lampau tidak dihitung.
          </p>
        </div>
        <div className="grid gap-4 lg:grid-cols-2">
          <Panel judul="Kasus per tingkat hukuman">
            <GrafikBatang id="tingkat" data={d.grafik.tingkat} judul="Kasus per tingkat hukuman" labelKolom="Tingkat" />
          </Panel>
          <Panel judul="Kasus per rezim">
            <GrafikBatang id="rezim" data={d.grafik.rezim} judul="Kasus per rezim" labelKolom="Rezim" />
          </Panel>
          <Panel judul="Kasus per unit kerja (10 terbanyak)">
            <GrafikBatang id="unit" data={d.grafik.unit} judul="Kasus per unit kerja" labelKolom="Unit kerja" />
          </Panel>
          <Panel judul="Tren kasus tercatat per bulan">
            <GrafikTren data={d.grafik.tren} judul="Kasus tercatat per bulan, 12 bulan terakhir" />
          </Panel>
        </div>
      </section>
    </div>
  );
}

// ---------------------------------------------------------------------------

function KartuAngka({
  href, ikon: Ikon, label, nilai, keterangan, warna,
}: { href: string; ikon: typeof Gavel; label: string; nilai: number; keterangan: string; warna?: "aman" | "waspada" | "lewat" }) {
  const gaya = {
    aman: "text-aman bg-aman-muda",
    waspada: "text-waspada bg-waspada-muda",
    lewat: "text-lewat bg-lewat-muda",
  };
  return (
    <Link href={href} className="group flex min-h-28 flex-col justify-between gap-2 rounded-xl border bg-card p-4 shadow-sm transition-colors hover:border-primary/40">
      <span className="flex items-start justify-between gap-2">
        <span className="text-sm font-medium text-muted-foreground">{label}</span>
        <span className={cn("flex size-9 shrink-0 items-center justify-center rounded-lg", warna ? gaya[warna] : "bg-secondary text-secondary-foreground")}>
          <Ikon className="size-5" aria-hidden />
        </span>
      </span>
      <span>
        <span className={cn("block text-3xl font-bold tabular-nums tracking-tight", warna === "lewat" && "text-lewat", warna === "waspada" && "text-waspada")}>{angka(nilai)}</span>
        <span className="block text-xs text-muted-foreground">{keterangan}</span>
      </span>
    </Link>
  );
}

function KartuKanban({ k }: { k: KolomKanban["kasus"][number] }) {
  return (
    <li>
      <Link href={`/kasus/${k.id}`} className="block space-y-1.5 rounded-lg border bg-background p-3 text-sm shadow-xs transition-colors hover:border-primary/50 hover:bg-accent/40">
        <span className="block font-mono text-xs text-muted-foreground">{k.nomor}</span>
        <span className="line-clamp-2 block font-medium leading-snug">{k.judul}</span>
        <span className="block truncate text-muted-foreground"><Pii>{k.nama}</Pii></span>
        <span className="flex flex-wrap items-center gap-1.5 pt-0.5">
          {k.tingkat && <Lencana>{k.tingkat.charAt(0).toUpperCase() + k.tingkat.slice(1)}</Lencana>}
          {k.tenggat && <LencanaTenggat status={k.tenggat} />}
        </span>
        {k.tahap && <span className="block text-xs text-muted-foreground">Tahap: {k.tahap}</span>}
      </Link>
    </li>
  );
}

function Kanban({ kolom }: { kolom: KolomKanban[] }) {
  return (
    <>
      {/* Ponsel: akordeon bertumpuk */}
      <div className="space-y-2 md:hidden">
        {kolom.map((c) => (
          <details key={c.kode} className="group rounded-lg border bg-muted/40" open={c.jumlah > 0 && c.jumlah <= 3}>
            <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-2 px-3 font-medium [&::-webkit-details-marker]:hidden">
              <span>{c.nama}</span>
              <span className="flex items-center gap-2">
                <span className="rounded-full bg-secondary px-2 py-0.5 text-xs font-semibold tabular-nums">{c.jumlah}</span>
                <ChevronRight className="size-4 transition-transform group-open:rotate-90" aria-hidden />
              </span>
            </summary>
            <div className="px-3 pb-3">
              {c.jumlah === 0 ? (
                <p className="text-sm text-muted-foreground">Tidak ada kasus.</p>
              ) : (
                <ul className="space-y-2">{c.kasus.map((k) => <KartuKanban key={k.id} k={k} />)}</ul>
              )}
              {c.jumlah > c.kasus.length && <LihatSemua kode={c.kode} jumlah={c.jumlah} />}
            </div>
          </details>
        ))}
      </div>
      {/* Tablet & laptop: kolom yang bisa digulir mendatar di dalam kotak ini saja */}
      <div className="hidden overflow-x-auto pb-2 md:block" role="region" aria-label="Papan tahapan, gulir ke samping untuk melihat semua kolom" tabIndex={0}>
        <div className="flex w-max gap-3">
          {kolom.map((c) => (
            <section key={c.kode} aria-label={`${c.nama}: ${c.jumlah} kasus`} className="flex w-64 shrink-0 flex-col rounded-lg border bg-muted/40">
              <h3 className="flex items-center justify-between gap-2 border-b px-3 py-2.5 text-sm font-semibold">
                {c.nama}
                <span className="rounded-full bg-secondary px-2 py-0.5 text-xs tabular-nums">{c.jumlah}</span>
              </h3>
              <div className="flex-1 p-2">
                {c.jumlah === 0 ? (
                  <p className="px-1 py-4 text-center text-sm text-muted-foreground">Kosong</p>
                ) : (
                  <ul className="space-y-2">{c.kasus.map((k) => <KartuKanban key={k.id} k={k} />)}</ul>
                )}
                {c.jumlah > c.kasus.length && <LihatSemua kode={c.kode} jumlah={c.jumlah} />}
              </div>
            </section>
          ))}
        </div>
      </div>
    </>
  );
}

function LihatSemua({ kode, jumlah }: { kode: string; jumlah: number }) {
  return (
    <Link href={`/kasus?status=${encodeURIComponent(kode)}`} className="mt-2 flex min-h-11 items-center justify-center rounded-md text-sm font-medium text-primary hover:bg-accent">
      Lihat semua ({jumlah})
    </Link>
  );
}

function DaftarTenggat({ d }: { d: DataBeranda }) {
  if (!d.tenggat.length) {
    return <Kosong ikon={CalendarClock} judul="Tidak ada tenggat dalam 14 hari ke depan" deskripsi="Semua tahap kasus yang berjalan masih jauh dari jatuh tempo, atau belum ada kasus berjalan." />;
  }
  return (
    <div className="space-y-2">
      <ul className="divide-y rounded-lg border">
        {d.tenggat.map((t) => (
          <li key={t.tahapId}>
            <Link href={`/kasus/${t.entriId}`} className="flex flex-col gap-2 p-3 hover:bg-accent/40 sm:flex-row sm:items-center sm:justify-between">
              <span className="min-w-0 space-y-0.5">
                <span className="block font-medium leading-snug">{t.tahap}</span>
                <span className="block truncate text-sm text-muted-foreground">
                  <span className="font-mono text-xs">{t.nomor}</span> · {t.judul} · <Pii>{t.nama}</Pii>
                </span>
              </span>
              <span className="flex shrink-0 flex-wrap items-center gap-1.5 sm:justify-end">
                <span className="text-sm tabular-nums text-muted-foreground">{tanggalPendek(t.tanggal)}</span>
                <LencanaTenggat status={t.status} />
                {t.sifat === "pengingat_internal" ? (
                  <Lencana warna="info">Pengingat internal</Lencana>
                ) : (
                  <Lencana>Wajib hukum</Lencana>
                )}
              </span>
            </Link>
          </li>
        ))}
      </ul>
      {d.tenggatTotal > d.tenggat.length && (
        <p className="text-sm text-muted-foreground">
          Menampilkan {d.tenggat.length} dari {d.tenggatTotal} tahap. <Link href="/laporan/kasus-berjalan" className="font-medium text-primary hover:underline">Lihat daftar lengkap</Link>
        </p>
      )}
    </div>
  );
}

function DaftarKehadiran({ d }: { d: DataBeranda }) {
  const k = d.kehadiran;
  return (
    <div className="space-y-3">
      {k.peringatan.map((p) => <Catatan key={p} jenis="waspada">{p}</Catatan>)}
      {!k.daftar.length ? (
        <Kosong ikon={UserRoundSearch} judul="Tidak ada pegawai mendekati ambang" deskripsi="Daftar ini terisi dari catatan kehadiran (rekap tidak masuk kerja) tahun berjalan." />
      ) : (
        <ul className="divide-y rounded-lg border">
          {k.daftar.slice(0, 10).map((x) => (
            <li key={x.pegawaiId}>
              <Link href={`/pegawai/${x.pegawaiId}`} className="block space-y-1 p-3 hover:bg-accent/40">
                <span className="flex items-start justify-between gap-2">
                  <span className="min-w-0">
                    <span className="block truncate font-medium"><Pii>{x.nama}</Pii></span>
                    <span className="block truncate text-xs text-muted-foreground"><Pii>{x.nip ?? "—"}</Pii>{x.unit ? ` · ${x.unit}` : ""}</span>
                  </span>
                  <Lencana warna={x.selisih <= 1 ? "lewat" : "waspada"}>{x.selisih} hari lagi</Lencana>
                </span>
                <span className="block text-sm text-muted-foreground">
                  {x.total} hari tidak masuk kerja{x.berturut ? ` (terpanjang ${x.berturut} berturut-turut)` : ""}. Pada {x.berikut.hariMin} hari:{" "}
                  <span className="font-medium text-foreground">{x.berikut.tingkat ? `${x.berikut.tingkat} — ` : ""}{x.berikut.jenis ?? "—"}</span>
                  <span className="text-xs"> ({x.regulasi})</span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
      {k.daftar.length > 10 && <p className="text-sm text-muted-foreground">Dan {k.daftar.length - 10} pegawai lainnya.</p>}
    </div>
  );
}
