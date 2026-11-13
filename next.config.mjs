/**
 * Arquivo em JavaScript puro (e não .ts): assim o Next não precisa compilar a configuração antes de começar,
 * o que falha em servidores com a biblioteca do sistema (glibc) antiga.
 * @type {import("next").NextConfig}
 */
const nextConfig = {
  // Montagem separada para o teste de carga (NEXT_DIST_DIR=.next-carga), sem mexer no app que está no ar.
  distDir: process.env.NEXT_DIST_DIR || ".next",
  // Pacote pronto para hospedagens que só executam (BUILD_STANDALONE=1): gera server.js com o que precisa para rodar.
  output: process.env.BUILD_STANDALONE === "1" ? "standalone" : undefined,
  // Garante que as migrações vão junto no pacote.
  outputFileTracingIncludes: { "/**": ["./netlify/database/migrations/**/*"] },
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
