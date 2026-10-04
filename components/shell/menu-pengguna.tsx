"use client";

import Link from "next/link";
import { useClerk } from "@clerk/nextjs";
import { HelpCircle, KeyRound, LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import type { InfoPengguna } from "./kerangka";

function inisial(nama: string) {
  return nama.split(/\s+/).filter(Boolean).slice(0, 2).map((s) => s[0]?.toUpperCase()).join("") || "?";
}

export function MenuPengguna({ pengguna }: { pengguna: InfoPengguna }) {
  const { signOut, openUserProfile } = useClerk();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" className="h-11 gap-2 px-1.5 sm:px-2" aria-label={`Menu pengguna: ${pengguna.nama}`}>
          <span className="flex size-9 items-center justify-center rounded-full bg-primary text-sm font-semibold text-primary-foreground">{inisial(pengguna.nama)}</span>
          <span className="hidden text-left leading-tight xl:block">
            <span className="block max-w-40 truncate text-sm font-medium">{pengguna.nama}</span>
            <span className="block text-xs text-muted-foreground">{pengguna.peran}</span>
          </span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-72">
        <DropdownMenuLabel className="font-normal">
          <div className="font-semibold">{pengguna.nama}</div>
          <div className="text-sm text-muted-foreground">{pengguna.email}</div>
          <div className="mt-1 text-xs text-muted-foreground">Peran: {pengguna.peran}{pengguna.jabatan ? ` · ${pengguna.jabatan}` : ""}</div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => openUserProfile()}>
          <KeyRound /> Keamanan akun & verifikasi dua langkah
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link href="/bantuan"><HelpCircle /> Bantuan</Link>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => signOut({ redirectUrl: "/masuk" })}>
          <LogOut /> Keluar
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
