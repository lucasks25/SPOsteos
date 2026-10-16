import type { NextConfig } from "next";

// Cabeçalhos de segurança estáticos, para todas as rotas. A Content-Security-Policy NÃO fica aqui: ela leva nonce por
// requisição e é montada em src/proxy.ts (guia: node_modules/next/dist/docs/01-app/02-guides/content-security-policy.md).
// HSTS sem "preload" de propósito: preload entra em listas do navegador e é difícil de desfazer; só vale se o domínio
// for submetido em hstspreload.org (ver docs/PRODUCAO-SEGURA.md). Atenção: "includeSubDomains" exige HTTPS em todos os subdomínios.
const securityHeaders = [
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "same-origin" },
  { key: "Permissions-Policy", value: "accelerometer=(), autoplay=(), camera=(), display-capture=(), encrypted-media=(), fullscreen=(self), geolocation=(), gyroscope=(), magnetometer=(), microphone=(), midi=(), payment=(), publickey-credentials-get=(), screen-wake-lock=(), usb=(), xr-spatial-tracking=()" },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
  { key: "Cross-Origin-Resource-Policy", value: "same-origin" },
  { key: "X-DNS-Prefetch-Control", value: "off" },
  { key: "X-Permitted-Cross-Domain-Policies", value: "none" },
];

const nextConfig: NextConfig = {
  poweredByHeader: false,
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
  // ERP interno: praticamente todas as telas são dinâmicas por usuário,
  // então mantemos a renderização dinâmica clássica (sem Cache Components).
  // Server Actions aceitam 1 MB por padrão; anexos de cirurgia (até 10 MB) e extratos OFX (até 5 MB) precisam de mais.
  experimental: { serverActions: { bodySizeLimit: "11mb" } },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
