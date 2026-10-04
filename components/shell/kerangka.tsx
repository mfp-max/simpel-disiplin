"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { Menu, MoreHorizontal } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { NAV_BAWAH, NAV_PONSEL, NAV_UTAMA, type ItemNav } from "./navigasi";
import { PencarianGlobal } from "./pencarian-global";
import { TombolPrivasi } from "./tombol-privasi";
import { TombolTema } from "./tombol-tema";
import { MenuPengguna } from "./menu-pengguna";
import { PenjagaSesi } from "./penjaga-sesi";

export type InfoPengguna = { nama: string; email: string; peran: string; jabatan: string | null; kelolaPengaturan: boolean };

function aktif(path: string, href: string) {
  return path === href || path.startsWith(href + "/");
}

function Merek({ kecil = false }: { kecil?: boolean }) {
  return (
    <Link href="/beranda" className="flex items-center gap-3 rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-ring">
      <Image src="/logo-um.png" alt="Logo UM" width={kecil ? 30 : 36} height={kecil ? 32 : 39} className="dark:brightness-[2.2] dark:saturate-50" />
      <div className="leading-tight">
        <div className="text-lg font-bold tracking-tight text-primary">SIMPEL</div>
        {!kecil && <div className="text-xs text-muted-foreground">Manajemen Pelanggaran · UM</div>}
      </div>
    </Link>
  );
}

function DaftarNav({ items, path, lencana, onPilih }: { items: ItemNav[]; path: string; lencana: Record<string, number>; onPilih?: () => void }) {
  return (
    <ul className="space-y-1">
      {items.map((it) => {
        const on = aktif(path, it.href);
        const Ikon = it.ikon;
        return (
          <li key={it.href}>
            <Link
              href={it.href}
              onClick={onPilih}
              aria-current={on ? "page" : undefined}
              className={cn(
                "flex min-h-11 items-center gap-3 rounded-lg px-3 py-2 text-[15px] font-medium transition-colors",
                on ? "bg-primary text-primary-foreground shadow-sm" : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
              )}
            >
              <Ikon className="size-5 shrink-0" aria-hidden />
              <span className="flex-1">{it.label}</span>
              {lencana[it.href] ? (
                <span className={cn("rounded-full px-2 py-0.5 text-xs font-semibold", on ? "bg-primary-foreground/20" : "bg-waspada-muda text-waspada")}>
                  {lencana[it.href]}
                </span>
              ) : null}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

export function Kerangka({
  pengguna, lencana, batasIdleMenit, children,
}: { pengguna: InfoPengguna; lencana: Record<string, number>; batasIdleMenit: number; children: React.ReactNode }) {
  const path = usePathname();
  const [bukaMenu, setBukaMenu] = useState(false);
  const bawah = NAV_BAWAH;

  useEffect(() => setBukaMenu(false), [path]);

  const isiSidebar = (onPilih?: () => void) => (
    <nav aria-label="Menu utama" className="flex h-full flex-col gap-6">
      <DaftarNav items={NAV_UTAMA} path={path} lencana={lencana} onPilih={onPilih} />
      <div className="mt-auto border-t pt-4">
        <DaftarNav items={bawah} path={path} lencana={{}} onPilih={onPilih} />
      </div>
    </nav>
  );

  const ponsel = NAV_UTAMA.filter((n) => NAV_PONSEL.includes(n.href));

  return (
    <div className="min-h-dvh">
      <a href="#isi" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-md focus:bg-primary focus:px-4 focus:py-2 focus:text-primary-foreground">
        Langsung ke isi
      </a>
      <PenjagaSesi batasMenit={batasIdleMenit} />

      {/* Sidebar desktop */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-72 flex-col border-r bg-sidebar/95 px-4 py-5 backdrop-blur lg:flex">
        <div className="mb-6 px-1">
          <Merek />
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto pr-1">{isiSidebar()}</div>
      </aside>

      <div className="lg:pl-72">
        {/* Kepala halaman */}
        <header className="tanpa-cetak sticky top-0 z-20 border-b bg-background/85 backdrop-blur supports-[backdrop-filter]:bg-background/70">
          <div className="mx-auto flex h-16 max-w-7xl items-center gap-2 px-4 sm:gap-3 sm:px-6">
            <Sheet open={bukaMenu} onOpenChange={setBukaMenu}>
              <SheetTrigger asChild>
                <Button variant="ghost" size="icon" className="lg:hidden" aria-label="Buka menu">
                  <Menu className="size-6" />
                </Button>
              </SheetTrigger>
              <SheetContent side="left" className="w-[86vw] max-w-80 p-4">
                <SheetHeader className="p-1 pb-4">
                  <SheetTitle asChild>
                    <div><Merek /></div>
                  </SheetTitle>
                </SheetHeader>
                {isiSidebar(() => setBukaMenu(false))}
              </SheetContent>
            </Sheet>
            <div className="lg:hidden">
              <Merek kecil />
            </div>
            <div className="flex flex-1 justify-end sm:justify-start">
              <PencarianGlobal />
            </div>
            <TombolPrivasi />
            <TombolTema />
            <MenuPengguna pengguna={pengguna} />
          </div>
        </header>

        <main id="isi" className="mx-auto w-full max-w-7xl px-4 pb-28 pt-5 sm:px-6 sm:pt-6 lg:pb-12">
          {children}
        </main>
      </div>

      {/* Menu bawah ponsel */}
      <nav aria-label="Menu cepat" className="tanpa-cetak fixed inset-x-0 bottom-0 z-30 border-t bg-background/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden">
        <ul className="grid grid-cols-5">
          {ponsel.map((it) => {
            const on = aktif(path, it.href);
            const Ikon = it.ikon;
            return (
              <li key={it.href}>
                <Link href={it.href} aria-current={on ? "page" : undefined} className={cn("relative flex min-h-16 flex-col items-center justify-center gap-1 px-1 text-[11px] font-medium leading-tight", on ? "text-primary" : "text-muted-foreground")}>
                  <Ikon className="size-6" aria-hidden />
                  <span className="line-clamp-1">{it.label.replace("Registrasi ", "").replace(" Hukdis", "")}</span>
                  {lencana[it.href] ? <span className="absolute right-3 top-2 size-2 rounded-full bg-waspada" aria-label={`${lencana[it.href]} baru`} /> : null}
                </Link>
              </li>
            );
          })}
          <li>
            <button type="button" onClick={() => setBukaMenu(true)} className="flex min-h-16 w-full flex-col items-center justify-center gap-1 text-[11px] font-medium text-muted-foreground">
              <MoreHorizontal className="size-6" aria-hidden />
              Lainnya
            </button>
          </li>
        </ul>
      </nav>
    </div>
  );
}
