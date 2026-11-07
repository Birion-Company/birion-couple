import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Todas as telas dependem de quem está logado, então são renderizadas a cada pedido.
  experimental: {
    serverActions: { bodySizeLimit: "4mb" }, // importação envia o texto do arquivo
  },
  poweredByHeader: false,
};

export default nextConfig;
