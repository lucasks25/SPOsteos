// Paleta SP OSTEOS (azul #1b7fc4 + roxo #4b2a85, menu azul-marinho, neutros frios) e verificação WCAG.
// Uso: node src/app/estilos/paleta.mjs            -> relatório de contraste
//      node src/app/estilos/paleta.mjs --css      -> imprime os blocos :root (claro/escuro) para tokens.css
const passos = [50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950];
const esc = (arr) => Object.fromEntries(passos.map((p, i) => [p, arr[i]]));

export const claro = {
  // azul da marca: 600 = #1b7fc4 (logo); 700 = botão/link (texto branco 4,5:1)
  teal: esc(["#eef6fc", "#d9eaf8", "#b6d6f0", "#84bae4", "#4f9cd6", "#2b8bcf", "#1b7fc4", "#166aa6", "#125789", "#0f476f", "#0a2d48"]),
  slate: esc(["#f8fafc", "#f1f4f8", "#e3e8ef", "#cbd3de", "#8190a5", "#5d6b80", "#4a576b", "#364256", "#232d3e", "#131b2b", "#0a101c"]),
  emerald: esc(["#effaf3", "#d9f2e2", "#b3e4c4", "#7fcf9c", "#3fae68", "#1a9047", "#15803d", "#166534", "#14532d", "#11442a", "#062b17"]),
  rose: esc(["#fef2f2", "#fde3e3", "#fbcaca", "#f6a3a3", "#ec6b6b", "#dc2f2f", "#b91c1c", "#991b1b", "#7f1d1d", "#691a1a", "#430b0b"]),
  amber: esc(["#fffbeb", "#fef3c7", "#fde68a", "#fbd04f", "#f5ae24", "#dd8a0a", "#b45309", "#92400e", "#78350f", "#652d10", "#3f1904"]),
  sky: esc(["#f0f7ff", "#ddeefe", "#bcdcfb", "#89c1f5", "#4f9ee9", "#2a80d6", "#1d67b8", "#195495", "#18467a", "#163b64", "#0e2541"]),
  // roxo da marca: 700 = #4b2a85 (logo)
  violet: esc(["#f5f2fb", "#ebe4f6", "#d6c9ed", "#b8a0de", "#9474c9", "#7552b0", "#5f3c9c", "#4b2a85", "#3e236e", "#331d5a", "#20123a"]),
};

export const escuro = {
  teal: esc(["#10243a", "#132c47", "#183a5e", "#1f4f80", "#2c6ea8", "#3f8dcc", "#62a6de", "#7db7e6", "#a6cdee", "#cfe3f6", "#ebf4fc"]),
  slate: esc(["#182134", "#1c263a", "#26314a", "#36425c", "#68758d", "#8c98ad", "#a8b2c4", "#c3cbd8", "#dce2eb", "#edf1f6", "#ffffff"]),
  emerald: esc(["#0e2a1c", "#123424", "#194a33", "#226a48", "#2f8f61", "#45ae7b", "#68c695", "#84d3a9", "#ace3c4", "#d0f0de", "#ebf9f1"]),
  rose: esc(["#361518", "#441a1e", "#5f2328", "#842f35", "#bf4a50", "#e2676c", "#ee8a8e", "#f3a4a7", "#f8c5c7", "#fbdfe0", "#fdf0f0"]),
  amber: esc(["#2f230e", "#3b2b10", "#563e14", "#7a5719", "#ac7b22", "#d49b38", "#e8b860", "#efca80", "#f5ddac", "#faedd1", "#fdf6e9"]),
  sky: esc(["#11253d", "#152d4a", "#1b3d63", "#245285", "#3572b5", "#5390d6", "#78ace6", "#94bfee", "#bbd7f4", "#dbeaf9", "#eef5fd"]),
  violet: esc(["#221a3a", "#2a2048", "#382b61", "#4b3a85", "#6c5ab3", "#8d7bd2", "#a99be2", "#bcb1ea", "#d6cef4", "#e9e5f9", "#f5f3fc"]),
};

export const extra = {
  claro: {
    bg: "#f4f6f9", surface: "#ffffff", fg: "#131b2b",
    primary: "#166aa6", primaryHover: "#125789", primaryActive: "#0f476f", onPrimary: "#ffffff", focus: "#1b7fc4",
    accent: "#4b2a85", accentSoft: "#f5f2fb", onAccentSoft: "#4b2a85",
    sidebar: "#0f1f3d", sidebarFg: "#c7d2e6", sidebarFgActive: "#ffffff", sidebarAccent: "#a78fe0",
    fieldBorder: "#8190a5",
  },
  escuro: {
    bg: "#0d1422", surface: "#141c2d", fg: "#edf1f6",
    primary: "#5aa3dc", primaryHover: "#74b3e4", primaryActive: "#4a93cc", onPrimary: "#08182b", focus: "#7db7e6",
    accent: "#a99be2", accentSoft: "#221a3a", onAccentSoft: "#bcb1ea",
    sidebar: "#0a1426", sidebarFg: "#b4c0d6", sidebarFgActive: "#ffffff", sidebarAccent: "#a99be2",
    fieldBorder: "#68758d",
  },
};

function lum(hex) {
  const n = parseInt(hex.slice(1), 16);
  const c = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => {
    v /= 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
}
export function ratio(a, b) {
  const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
}

const pares = (p, e) => [
  ["texto slate-900 / superfície", p.slate[900], e.surface, 4.5],
  ["texto slate-900 / fundo", p.slate[900], e.bg, 4.5],
  ["apagado slate-500 / superfície", p.slate[500], e.surface, 4.5],
  ["apagado slate-500 / fundo", p.slate[500], e.bg, 4.5],
  ["apagado slate-500 / slate-50", p.slate[500], p.slate[50], 4.5],
  ["apagado slate-500 / slate-100", p.slate[500], p.slate[100], 4.5],
  ["rótulo slate-600 / superfície", p.slate[600], e.surface, 4.5],
  ["rótulo slate-600 / fundo", p.slate[600], e.bg, 4.5],
  ["link teal-700 / superfície", p.teal[700], e.surface, 4.5],
  ["link teal-700 / fundo", p.teal[700], e.bg, 4.5],
  ["link teal-700 / teal-50 (hover)", p.teal[700], p.teal[50], 4.5],
  ["botão primário on/primary", e.onPrimary, e.primary, 4.5],
  ["botão primário hover", e.onPrimary, e.primaryHover, 4.5],
  ["botão primário pressionado", e.onPrimary, e.primaryActive, 4.5],
  ["badge emerald-700/50", p.emerald[700], p.emerald[50], 4.5],
  ["badge amber-700/50", p.amber[700], p.amber[50], 4.5],
  ["badge rose-700/50", p.rose[700], p.rose[50], 4.5],
  ["badge rose-600/50", p.rose[600], p.rose[50], 4.5],
  ["badge sky-700/50", p.sky[700], p.sky[50], 4.5],
  ["badge teal-700/50", p.teal[700], p.teal[50], 4.5],
  ["badge violet-700/50", p.violet[700], p.violet[50], 4.5],
  ["badge slate-700/100", p.slate[700], p.slate[100], 4.5],
  ["texto amber-600 / superfície", p.amber[600], e.surface, 4.5],
  ["texto rose-600 / superfície", p.rose[600], e.surface, 4.5],
  ["texto emerald-600 / superfície", p.emerald[600], e.surface, 4.5],
  ["texto emerald-700 / superfície", p.emerald[700], e.surface, 4.5],
  ["texto sky-700 / superfície", p.sky[700], e.surface, 4.5],
  ["texto violet-700 / superfície", p.violet[700], e.surface, 4.5],
  ["texto teal-600 / superfície", p.teal[600], e.surface, 3],
  ["acento on-accent / accent-soft", e.onAccentSoft, e.accentSoft, 4.5],
  ["menu lateral texto", e.sidebarFg, e.sidebar, 4.5],
  ["menu lateral texto 70% (rótulo de grupo) aprox.", mix(e.sidebarFg, e.sidebar, 0.7), e.sidebar, 4.5],
  ["menu lateral destaque/fundo (3:1)", e.sidebarAccent, e.sidebar, 3],
  ["menu avatar sidebar / destaque", e.sidebar, e.sidebarAccent, 4.5],
  ["borda de campo / superfície (3:1)", e.fieldBorder, e.surface, 3],
  ["ícone slate-400 / superfície (3:1)", p.slate[400], e.surface, 3],
  ["foco / superfície (3:1)", e.focus, e.surface, 3],
  ["foco / fundo (3:1)", e.focus, e.bg, 3],
  ["barra gráfico teal-600 / superfície (3:1)", p.teal[600], e.surface, 3],
  ["barra gráfico violet-500 / superfície (3:1)", p.violet[500], e.surface, 3],
  ["danger rose-700 / rose-50", p.rose[700], p.rose[50], 4.5],
  ["faixa amber-800 / amber-50", p.amber[800], p.amber[50], 4.5],
  ["faixa sky-800 / sky-50", p.sky[800], p.sky[50], 4.5],
];

function mix(a, b, t) {
  const pa = parseInt(a.slice(1), 16), pb = parseInt(b.slice(1), 16);
  const ch = (s) => Math.round(((pa >> s) & 255) * t + ((pb >> s) & 255) * (1 - t));
  return "#" + [16, 8, 0].map((s) => ch(s).toString(16).padStart(2, "0")).join("");
}

function bloco(p, e, ind) {
  const l = [];
  for (const nome of ["teal", "slate", "emerald", "rose", "amber", "sky", "violet"]) for (const s of passos) l.push(`--c-${nome}-${s}: ${p[nome][s]};`);
  const escuro = e === extra.escuro;
  l.push(`--c-white: ${e.surface};`, "--c-black: #000000;");
  l.push(`--bg: ${e.bg};`, `--surface: ${e.surface};`, `--fg: ${e.fg};`);
  l.push(`--primary: ${e.primary};`, `--primary-hover: ${e.primaryHover};`, `--primary-active: ${e.primaryActive};`, `--on-primary: ${e.onPrimary};`, `--focus: ${e.focus};`);
  l.push(`--accent: ${e.accent};`, `--accent-soft: ${e.accentSoft};`, `--on-accent-soft: ${e.onAccentSoft};`);
  l.push(`--sidebar: ${e.sidebar};`, `--sidebar-fg: ${e.sidebarFg};`, `--sidebar-fg-ativo: ${e.sidebarFgActive};`, `--sidebar-destaque: ${e.sidebarAccent};`);
  l.push(`--field-border: ${e.fieldBorder};`);
  if (escuro) {
    l.push("--shadow-card: 0 0 #0000;", "--shadow-raised: 0 4px 12px -4px rgba(0, 0, 0, 0.5);", "--shadow-overlay: 0 12px 32px -8px rgba(0, 0, 0, 0.7), 0 0 0 1px rgba(255, 255, 255, 0.06);", `--shadow-header: 0 1px 0 0 ${p.slate[200]};`, "color-scheme: dark;");
  } else {
    l.push("--shadow-card: 0 0 #0000;", "--shadow-raised: 0 2px 8px -2px rgba(15, 31, 61, 0.12);", "--shadow-overlay: 0 12px 32px -8px rgba(15, 31, 61, 0.22), 0 2px 6px -2px rgba(15, 31, 61, 0.08);", `--shadow-header: 0 1px 0 0 ${p.slate[200]};`, "color-scheme: light;");
  }
  return l.map((x) => ind + x).join("\n");
}

if (process.argv.includes("--css")) {
  console.log(`/* Claro */\n:root {\n${bloco(claro, extra.claro, "  ")}\n}\n`);
  console.log(`/* Escuro escolhido pelo usuário (data-theme="dark", cookie opme_tema) */\n@media screen {\n  :root[data-theme="dark"] {\n${bloco(escuro, extra.escuro, "    ")}\n  }\n}\n`);
  console.log(`/* Escuro pelo sistema operacional, quando o usuário não escolheu (mesmos valores do bloco acima) */\n@media screen and (prefers-color-scheme: dark) {\n  :root:not([data-theme="light"]) {\n${bloco(escuro, extra.escuro, "    ")}\n  }\n}`);
} else {
  let falhas = 0;
  for (const [modo, p, e] of [["CLARO", claro, extra.claro], ["ESCURO", escuro, extra.escuro]]) {
    console.log(`\n${modo}`);
    for (const [n, a, b, min] of pares(p, e)) {
      const r = ratio(a, b);
      if (r < min) falhas++;
      console.log(`${r >= min ? "ok   " : "FALHA"} ${r.toFixed(2).padStart(5)}  (min ${min})  ${n}`);
    }
  }
  console.log(`\nbranco sobre #1b7fc4 (azul do logo): ${ratio("#ffffff", "#1b7fc4").toFixed(2)}`);
  console.log(`#4b2a85 sobre branco: ${ratio("#4b2a85", "#ffffff").toFixed(2)}`);
  console.log(`\n${falhas} falha(s)`);
  process.exitCode = falhas ? 1 : 0;
}
