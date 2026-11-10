import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Todas as telas dependem de quem está logado, então são renderizadas a cada pedido.
  experimental: {
    serverActions: { bodySizeLimit: "4mb" }, // importação envia o texto do arquivo
  },
  poweredByHeader: false,
  // Envio de notificações push: biblioteca só do servidor, carregada direto pelo Node.
  serverExternalPackages: ["web-push"],
  // Abrir o servidor de desenvolvimento de outro aparelho (ex.: pelo Tailscale, do celular).
  // Os endereços vêm de fora do repositório (variável DEV_ORIGINS, definida pelo comando que sobe o app).
  allowedDevOrigins: (process.env.DEV_ORIGINS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean),
};

export default nextConfig;
