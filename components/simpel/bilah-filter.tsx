"use client";

import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { Loader2, Search, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export type OpsiFilter = { nama: string; label: string; opsi: { nilai: string; label: string }[] };

/** Kotak cari + filter dropdown yang menyimpan nilai di URL (bisa dibagikan/di-bookmark). */
export function BilahFilter({ placeholder = "Cari…", filter = [] }: { placeholder?: string; filter?: OpsiFilter[] }) {
  const router = useRouter();
  const path = usePathname();
  const sp = useSearchParams();
  const [q, setQ] = useState(sp.get("q") ?? "");
  const [sibuk, mulai] = useTransition();

  function setParam(kunci: string, nilai: string | null) {
    const p = new URLSearchParams(sp.toString());
    if (nilai) p.set(kunci, nilai);
    else p.delete(kunci);
    p.delete("hal");
    mulai(() => router.replace(`${path}?${p.toString()}`));
  }

  useEffect(() => {
    const t = setTimeout(() => {
      if ((sp.get("q") ?? "") !== q) setParam("q", q.trim() || null);
    }, 350);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  const adaFilter = filter.some((f) => sp.get(f.nama)) || !!sp.get("q");

  return (
    <div className="mb-4 flex flex-col gap-2 lg:flex-row lg:items-center">
      <div className="relative flex-1">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-5 -translate-y-1/2 text-muted-foreground" aria-hidden />
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={placeholder} className="bg-card pl-10" aria-label={placeholder} />
        {sibuk && <Loader2 className="absolute right-3 top-1/2 size-4 -translate-y-1/2 animate-spin text-muted-foreground" />}
      </div>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:flex">
        {filter.map((f) => (
          <Select key={f.nama} value={sp.get(f.nama) ?? "__semua"} onValueChange={(v) => setParam(f.nama, v === "__semua" ? null : v)}>
            <SelectTrigger className="w-full bg-card lg:w-52" aria-label={f.label}><SelectValue placeholder={f.label} /></SelectTrigger>
            <SelectContent>
              <SelectItem value="__semua">{f.label}: semua</SelectItem>
              {f.opsi.map((o) => <SelectItem key={o.nilai} value={o.nilai}>{o.label}</SelectItem>)}
            </SelectContent>
          </Select>
        ))}
        {adaFilter && (
          <Button variant="ghost" onClick={() => { setQ(""); mulai(() => router.replace(path)); }}>
            <X /> Hapus filter
          </Button>
        )}
      </div>
    </div>
  );
}
