import { TooltipProvider } from "@/components/ui/tooltip";
import { Kerangka } from "@/components/shell/kerangka";
import { wajibMasuk } from "@/lib/auth";
import { sql } from "@/lib/db";
import { pengaturan } from "@/lib/pengaturan";

export const dynamic = "force-dynamic";

export default async function LayoutAplikasi({ children }: { children: React.ReactNode }) {
  const p = await wajibMasuk();
  const [[{ n }], batas] = await Promise.all([
    sql`select count(*)::int as n from entri where kelas = 'informasi' and status_kasus = 'informasi' and diarsipkan_pada is null`,
    pengaturan<number>("batas_idle_menit", 30),
  ]);
  return (
    <TooltipProvider delayDuration={300}>
      <Kerangka
        pengguna={{ nama: p.nama, email: p.email, peran: p.peran_nama, jabatan: p.jabatan, kelolaPengaturan: p.hak.kelola_pengaturan }}
        lencana={{ "/informasi": n }}
        batasIdleMenit={Number(batas) || 30}
      >
        {children}
      </Kerangka>
    </TooltipProvider>
  );
}
