import Script from "next/script";
import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import { THEME_SCRIPT } from "@/components/theme-toggle";
import { Toaster } from "@/components/toaster";
import "./globals.css";

const inter = Inter({ variable: "--font-sans", subsets: ["latin"], display: "swap" });

// Prévia do link (WhatsApp, Instagram, iMessage…): a logo (opengraph-image.png) e o diferencial.
const SHARE_TITLE = "Birion Finance - Suas finanças, simples e práticas";
const SHARE_DESCRIPTION =
  "Finanças simples e práticas. No plano Família, todo mundo vê quem pagou e quem deve, sem planilha.";

export const metadata: Metadata = {
  // Endereço do site publicado (o Netlify define URL); serve para a imagem da prévia ter o link completo.
  metadataBase: new URL(process.env.URL ?? "https://birion-finance.netlify.app"),
  title: { default: "Birion Finance", template: "%s - Birion Finance" },
  description: SHARE_DESCRIPTION,
  applicationName: "Birion Finance",
  appleWebApp: { capable: true, title: "Birion", statusBarStyle: "default" },
  openGraph: {
    type: "website",
    locale: "pt_BR",
    siteName: "Birion Finance",
    title: SHARE_TITLE,
    description: SHARE_DESCRIPTION,
  },
  twitter: { card: "summary_large_image", title: SHARE_TITLE, description: SHARE_DESCRIPTION },
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
        <meta name="theme-color" content="#1c1613" />
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
