import {
  Archive, BarChart3, Calculator, Gavel, HandHeart, HelpCircle, Inbox, LayoutDashboard, Settings, Users,
  type LucideIcon,
} from "lucide-react";

export type ItemNav = { href: string; label: string; ikon: LucideIcon; keterangan: string; hanya?: "kelola_pengaturan" };

export const NAV_UTAMA: ItemNav[] = [
  { href: "/beranda", label: "Beranda", ikon: LayoutDashboard, keterangan: "Ringkasan, tenggat, dan monitoring" },
  { href: "/informasi", label: "Registrasi Informasi", ikon: Inbox, keterangan: "Surat/laporan yang belum menjadi perkara" },
  { href: "/kasus", label: "Kasus Hukdis", ikon: Gavel, keterangan: "Kasus hukuman disiplin yang berjalan" },
  { href: "/pembinaan", label: "Pembinaan", ikon: HandHeart, keterangan: "Teguran pembinaan, kode etik, konseling" },
  { href: "/arsip", label: "Arsip Lampau", ikon: Archive, keterangan: "Kasus sebelum SIMPEL ada" },
  { href: "/pegawai", label: "Pegawai", ikon: Users, keterangan: "Master pegawai & riwayat hukuman" },
  { href: "/laporan", label: "Laporan", ikon: BarChart3, keterangan: "Rekapitulasi & ekspor" },
  { href: "/alat", label: "Kalkulator", ikon: Calculator, keterangan: "Hari kerja, tenggat, ambang kehadiran" },
];

export const NAV_BAWAH: ItemNav[] = [
  { href: "/pengaturan", label: "Pengaturan", ikon: Settings, keterangan: "Pengguna, peraturan, template, master data" },
  { href: "/bantuan", label: "Bantuan", ikon: HelpCircle, keterangan: "Panduan pemakaian SIMPEL" },
];

// Menu bawah layar di ponsel (maks. 4 + "Lainnya")
export const NAV_PONSEL = ["/beranda", "/informasi", "/kasus", "/pegawai"];
