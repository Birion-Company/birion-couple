import Script from "next/script";
import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import { THEME_SCRIPT } from "@/components/theme-toggle";
import { Toaster } from "@/components/toaster";
import "./globals.css";

const inter = Inter({ variable: "--font-sans", subsets: ["latin"], display: "swap" });

export const metadata: Metadata = {
  title: { default: "BIRION FINANCE", template: "%s · BIRION FINANCE" },
  description: "Finanças da família em um só lugar: quem pagou, quem deve e o que falta pagar.",
  applicationName: "BIRION FINANCE",
  appleWebApp: { capable: true, title: "BIRION", statusBarStyle: "default" },
};

// Sem zoom (no celular confunde) e a cor da barra do celular vem do tema escolhido no app (ver THEME_SCRIPT).
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="pt-BR" className={inter.variable} data-theme="dark" suppressHydrationWarning>
      <head>
        <meta name="theme-color" content="#030a14" />
        {/* Aplica o tema salvo antes de desenhar a página (sem piscar claro → escuro). */}
        <Script id="bf-theme" strategy="beforeInteractive">
          {THEME_SCRIPT}
        </Script>
      </head>
      <body>
        {children}
        <Toaster />
      </body>
    </html>
  );
}
