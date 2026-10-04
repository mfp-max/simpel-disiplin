"use client";

import { useEffect, useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

const KUNCI = "simpel-mode-privasi";

/** Mode privasi: menyamarkan nama & NIP di layar (untuk presentasi/rapat). */
export function TombolPrivasi() {
  const [aktif, setAktif] = useState(false);

  useEffect(() => {
    try {
      setAktif(localStorage.getItem(KUNCI) === "1");
    } catch {}
  }, []);

  useEffect(() => {
    document.documentElement.classList.toggle("mode-privasi", aktif);
    try {
      localStorage.setItem(KUNCI, aktif ? "1" : "0");
    } catch {}
  }, [aktif]);

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant={aktif ? "default" : "ghost"}
          size="icon"
          onClick={() => setAktif((v) => !v)}
          aria-pressed={aktif}
          aria-label={aktif ? "Matikan mode privasi" : "Nyalakan mode privasi (samarkan nama & NIP)"}
        >
          {aktif ? <EyeOff className="size-5" /> : <Eye className="size-5" />}
        </Button>
      </TooltipTrigger>
      <TooltipContent>{aktif ? "Mode privasi aktif — nama & NIP disamarkan" : "Mode privasi (untuk rapat/presentasi)"}</TooltipContent>
    </Tooltip>
  );
}
