import type { Metadata, Viewport } from "next";
import { Plus_Jakarta_Sans, Geist_Mono } from "next/font/google";
import { ClerkProvider } from "@clerk/nextjs";
import { idID } from "@clerk/localizations";
import { ThemeProvider } from "@/components/theme-provider";
import { Toaster } from "@/components/ui/sonner";
import "./globals.css";

const jakarta = Plus_Jakarta_Sans({ variable: "--font-jakarta", subsets: ["latin"], display: "swap" });
const mono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"], display: "swap" });

export const metadata: Metadata = {
  title: { default: "SIMPEL — Universitas Negeri Malang", template: "%s · SIMPEL" },
  description: "Sistem Informasi Manajemen Pelanggaran — Direktorat Sumber Daya Manusia dan Keuangan, Universitas Negeri Malang",
  robots: { index: false, follow: false },
  applicationName: "SIMPEL",
  appleWebApp: { capable: true, title: "SIMPEL", statusBarStyle: "default" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f4f5f7" },
    { media: "(prefers-color-scheme: dark)", color: "#141a26" },
  ],
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <ClerkProvider
      localization={idID}
      signInUrl="/masuk"
      signUpUrl="/masuk"
      appearance={{
        variables: {
          // Mengikuti token tema SIMPEL sehingga otomatis terang/gelap
          colorPrimary: "var(--primary)", colorPrimaryForeground: "var(--primary-foreground)", colorBackground: "var(--card)",
          colorForeground: "var(--foreground)", colorMutedForeground: "var(--muted-foreground)", colorMuted: "var(--muted)",
          colorInput: "var(--background)", colorInputForeground: "var(--foreground)", colorBorder: "var(--border)", colorNeutral: "var(--foreground)",
          colorRing: "var(--ring)", colorDanger: "var(--destructive)", borderRadius: "0.75rem", fontFamily: "var(--font-jakarta)", fontSize: "1rem",
        },
      }}
    >
      <html lang="id" suppressHydrationWarning>
        <body className={`${jakarta.variable} ${mono.variable} font-sans`}>
          <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
            {children}
            <Toaster richColors position="top-center" closeButton />
          </ThemeProvider>
        </body>
      </html>
    </ClerkProvider>
  );
}
