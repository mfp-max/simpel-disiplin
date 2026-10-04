"use client";

import { toast } from "sonner";
import { FileSpreadsheet, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAksi } from "@/components/simpel/interaktif";
import { eksporAudit } from "./_aksi";

/** Unduh tampilan log audit yang sedang difilter sebagai berkas Excel. */
export function TombolEkspor({ filter, total }: { filter: Record<string, string | undefined>; total: number }) {
  const { jalankan, sibuk } = useAksi();
  function unduh() {
    jalankan(() => eksporAudit(filter), {
      segarkan: true,
      lalu: (d) => {
        const biner = Uint8Array.from(atob(d.base64), (c) => c.charCodeAt(0));
        const url = URL.createObjectURL(new Blob([biner], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }));
        const a = document.createElement("a");
        a.href = url;
        a.download = d.nama;
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 5000);
        toast.success(`${d.jumlah} catatan diekspor ke Excel`);
      },
    });
  }
  return (
    <Button variant="outline" onClick={unduh} disabled={sibuk || !total}>
      {sibuk ? <Loader2 className="animate-spin" /> : <FileSpreadsheet />} Ekspor ke Excel
    </Button>
  );
}
