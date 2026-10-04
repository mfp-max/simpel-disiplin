"use client";

import { useEffect, useRef, useState } from "react";
import { useClerk } from "@clerk/nextjs";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";

const PERINGATAN_DETIK = 60;

/** Keluar otomatis setelah tidak aktif (PRD §11 butir 5), dengan peringatan 1 menit sebelumnya. */
export function PenjagaSesi({ batasMenit }: { batasMenit: number }) {
  const { signOut } = useClerk();
  const terakhir = useRef(Date.now());
  const [sisa, setSisa] = useState<number | null>(null);

  useEffect(() => {
    const segarkan = () => {
      terakhir.current = Date.now();
      try { localStorage.setItem("simpel-aktif-terakhir", String(terakhir.current)); } catch {}
    };
    const peristiwa = ["pointerdown", "keydown", "scroll", "touchstart"] as const;
    peristiwa.forEach((e) => window.addEventListener(e, segarkan, { passive: true }));
    const onStorage = (e: StorageEvent) => {
      if (e.key === "simpel-aktif-terakhir" && e.newValue) terakhir.current = Number(e.newValue);
    };
    window.addEventListener("storage", onStorage);

    const iv = setInterval(() => {
      const diam = (Date.now() - terakhir.current) / 1000;
      const batas = batasMenit * 60;
      if (diam >= batas) {
        clearInterval(iv);
        signOut({ redirectUrl: "/masuk?alasan=tidak-aktif" });
      } else if (batas - diam <= PERINGATAN_DETIK) {
        setSisa(Math.ceil(batas - diam));
      } else {
        setSisa(null);
      }
    }, 1000);
    return () => {
      clearInterval(iv);
      peristiwa.forEach((e) => window.removeEventListener(e, segarkan));
      window.removeEventListener("storage", onStorage);
    };
  }, [batasMenit, signOut]);

  return (
    <AlertDialog open={sisa !== null}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Anda akan keluar otomatis</AlertDialogTitle>
          <AlertDialogDescription>
            Demi kerahasiaan data, sesi berakhir setelah {batasMenit} menit tidak ada aktivitas. Sisa waktu: <strong>{sisa} detik</strong>.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={() => signOut({ redirectUrl: "/masuk" })}>Keluar sekarang</AlertDialogCancel>
          <AlertDialogAction onClick={() => { terakhir.current = Date.now(); setSisa(null); }}>Saya masih di sini</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
