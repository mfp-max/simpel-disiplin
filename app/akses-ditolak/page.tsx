import Image from "next/image";
import { LockKeyhole } from "lucide-react";
import { TombolKeluar } from "@/components/shell/tombol-keluar";

export const metadata = { title: "Akses belum diberikan" };

export default function AksesDitolak() {
  return (
    <main className="flex min-h-dvh items-center justify-center px-4">
      <div className="w-full max-w-md rounded-2xl border bg-card p-8 text-center shadow-sm">
        <Image src="/logo-um.png" alt="" width={48} height={52} className="mx-auto mb-4 dark:brightness-[2.2] dark:saturate-50" />
        <div className="mx-auto mb-4 flex size-14 items-center justify-center rounded-full bg-waspada-muda text-waspada">
          <LockKeyhole className="size-7" aria-hidden />
        </div>
        <h1 className="text-xl font-semibold">Akses belum diberikan</h1>
        <p className="mt-2 text-muted-foreground">
          Akun Anda berhasil masuk, tetapi alamat email ini belum terdaftar sebagai pengguna SIMPEL atau sedang dinonaktifkan.
        </p>
        <p className="mt-2 text-muted-foreground">
          Hubungi admin SIMPEL di Seksi Kinerja, Disiplin, dan Sistem Informasi SDM agar email Anda didaftarkan.
        </p>
        <div className="mt-6">
          <TombolKeluar />
        </div>
      </div>
    </main>
  );
}
