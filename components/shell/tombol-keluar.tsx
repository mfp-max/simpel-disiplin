"use client";

import { useClerk } from "@clerk/nextjs";
import { LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";

export function TombolKeluar({ label = "Keluar dan masuk dengan akun lain" }: { label?: string }) {
  const { signOut } = useClerk();
  return (
    <Button variant="outline" onClick={() => signOut({ redirectUrl: "/masuk" })}>
      <LogOut aria-hidden />
      {label}
    </Button>
  );
}
