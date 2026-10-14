import type { NextConfig } from "next";

const nextConfig: NextConfig = {
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
