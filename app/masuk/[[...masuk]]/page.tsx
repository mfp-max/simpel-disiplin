import Image from "next/image";
import { SignIn } from "@clerk/nextjs";
import { ShieldCheck } from "lucide-react";

export const metadata = { title: "Masuk" };

export default function HalamanMasuk() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-8 px-4 py-10">
      <div className="flex flex-col items-center gap-3 text-center">
        <Image src="/logo-um.png" alt="Logo Universitas Negeri Malang" width={72} height={78} priority className="dark:brightness-[2.2] dark:saturate-50" />
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-primary sm:text-3xl">SIMPEL</h1>
          <p className="text-muted-foreground">Sistem Informasi Manajemen Pelanggaran</p>
          <p className="text-sm text-muted-foreground">Direktorat Sumber Daya Manusia dan Keuangan · Universitas Negeri Malang</p>
        </div>
      </div>
      <SignIn path="/masuk" routing="path" fallbackRedirectUrl="/beranda" signUpUrl="/masuk" />
      <p className="flex max-w-sm items-start gap-2 text-center text-sm text-muted-foreground">
        <ShieldCheck className="mt-0.5 size-4 shrink-0" aria-hidden />
        Hanya pengguna yang telah didaftarkan admin yang dapat masuk. Seluruh akses tercatat dalam log audit.
      </p>
    </main>
  );
}
