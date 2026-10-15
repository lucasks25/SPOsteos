import type { NextConfig } from "next";

// Cabeçalhos de segurança. A CSP completa (Content-Security-Policy) exige nonce com o Next: ver
// node_modules/next/dist/docs/01-app/02-guides/content-security-policy.md; fica como melhoria pós-MVP.
const securityHeaders = [
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "same-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
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
