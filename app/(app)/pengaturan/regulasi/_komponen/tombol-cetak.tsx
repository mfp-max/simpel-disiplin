"use client";

import { Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { catatCetakAksi } from "../_aksi";

export function TombolCetak({ regulasiId }: { regulasiId: string }) {
  return (
    <Button
      variant="outline"
      className="tanpa-cetak"
      onClick={async () => {
        try {
          await catatCetakAksi(regulasiId);
        } finally {
          window.print();
        }
      }}
    >
      <Printer /> Cetak
    </Button>
  );
}
