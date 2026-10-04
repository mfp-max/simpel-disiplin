import Image from "next/image";
import { SignUp } from "@clerk/nextjs";
import { ShieldCheck } from "lucide-react";

export const metadata = { title: "Aktifkan akun" };

// Pendaftaran pertama kali dengan email + kata sandi. Hanya email yang sudah
// didaftarkan admin (allowlist Clerk) yang dapat menyelesaikan langkah ini.
export default function HalamanDaftar() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-8 px-4 py-10">
      <div className="flex flex-col items-center gap-3 text-center">
        <Image src="/logo-um.png" alt="Logo Universitas Negeri Malang" width={72} height={78} priority className="dark:brightness-[2.2] dark:saturate-50" />
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-primary sm:text-3xl">Aktifkan akun SIMPEL</h1>
          <p className="text-muted-foreground">Gunakan email yang sudah didaftarkan admin.</p>
        </div>
      </div>
      <SignUp path="/daftar" routing="path" signInUrl="/masuk" fallbackRedirectUrl="/beranda" />
      <p className="flex max-w-sm items-start gap-2 text-center text-sm text-muted-foreground">
        <ShieldCheck className="mt-0.5 size-4 shrink-0" aria-hidden />
        Email yang belum didaftarkan admin akan ditolak secara otomatis.
      </p>
    </main>
  );
}
