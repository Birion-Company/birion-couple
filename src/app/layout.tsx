import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import { THEME_SCRIPT } from "@/components/theme-toggle";
import { Toaster } from "@/components/toaster";
import "./globals.css";

const inter = Inter({ variable: "--font-sans", subsets: ["latin"], display: "swap" });

export const metadata: Metadata = {
  title: { default: "BIRIUN FINANCE", template: "%s · BIRIUN FINANCE" },
  description: "Finanças da família em um só lugar: quem pagou, quem deve e o que está pendente.",
  applicationName: "BIRIUN FINANCE",
  appleWebApp: { capable: true, title: "BIRIUN", statusBarStyle: "default" },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f6f9fa" },
    { media: "(prefers-color-scheme: dark)", color: "#07111f" },
  ],
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="pt-BR" className={inter.variable} data-theme="light" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body>
        {children}
        <Toaster />
      </body>
    </html>
  );
}
