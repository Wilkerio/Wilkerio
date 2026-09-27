// Gera header.svg, neofetch.svg e heatmap.svg — 100% self-hosted, SEM PAT.
// Dado real vem de endpoints públicos do GitHub (HTML de contribuições + REST não-autenticado).
// Roda igual local ou no cron do Actions (usa GITHUB_PAT local só pra não bater rate limit
// da rede de casa; no Actions nem precisa, o runner tem IP proprio com limite folgado).
import { writeFileSync, mkdirSync } from "node:fs";

const USER = "Wilkerio";
const TOKEN = process.env.GITHUB_PAT || process.env.GITHUB_TOKEN || "";
const AUTH_HEADERS = TOKEN ? { Authorization: `Bearer ${TOKEN}` } : {};

const GOLD = "#BB9354";
const GOLD_DIM = "#7a6138";
const BLUE = "#0B2A52";
const BLUE_LIGHT = "#173F73";
const BG = "#0d1117";
const INK = "#c9d1d9";
const MUTED = "#6e7681";
const LEVEL_COLORS = ["#161b22", GOLD_DIM, BLUE_LIGHT, BLUE, GOLD];

function esc(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

async function fetchContributions() {
  const res = await fetch(`https://github.com/users/${USER}/contributions`, {
    headers: { "User-Agent": "Mozilla/5.0 gervia-readme-art" },
  });
  const html = await res.text();

  const totalMatch = html.match(/(\d[\d,]*)\s*\n?\s*contributions?\s*\n?\s*in the last year/i);
  const total = totalMatch ? totalMatch[1].replace(/,/g, "") : "0";

  const cellRe = /data-date="(\d{4}-\d{2}-\d{2})"[^>]*data-level="(\d)"/g;
  const days = [];
  let m;
  while ((m = cellRe.exec(html))) {
    days.push({ date: m[1], level: Number(m[2]) });
  }
  if (days.length === 0) throw new Error("Não consegui parsear o HTML de contribuições — GitHub deve ter mudado o markup.");
  return { total, days };
}

async function fetchPublicProfile() {
  const res = await fetch(`https://api.github.com/users/${USER}`, {
    headers: { "User-Agent": "gervia-readme-art", ...AUTH_HEADERS },
  });
  if (!res.ok) return { public_repos: "?", followers: "?" };
  const data = await res.json();
  return { public_repos: data.public_repos, followers: data.followers };
}

function buildHeatmapSvg({ total, days }) {
  const weeks = [];
  for (let i = 0; i < days.length; i += 7) weeks.push(days.slice(i, i + 7));

  const cell = 11;
  const gap = 3;
  const padTop = 30;
  const padLeft = 20;
  const width = padLeft * 2 + weeks.length * (cell + gap);
  const height = padTop + 7 * (cell + gap) + 10;

  let cells = "";
  weeks.forEach((week, wi) => {
    week.forEach((day, di) => {
      const x = padLeft + wi * (cell + gap);
      const y = padTop + di * (cell + gap);
      const delay = ((wi + di) * 0.012).toFixed(3);
      cells += `<rect class="cell" x="${x}" y="${y - 6}" width="${cell}" height="${cell}" rx="2" fill="${LEVEL_COLORS[day.level]}" opacity="0" style="animation-delay:${delay}s"><title>${day.date}</title></rect>\n`;
    });
  });

  return `<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Gráfico de contribuições">
  <style>
    .cell { animation: reveal 0.5s ease-out forwards; transform-origin: center; }
    @keyframes reveal { 0% { opacity: 0; transform: translate(-6px,-6px) scale(0.4); } 100% { opacity: 1; transform: translate(0,0) scale(1); } }
    @media (prefers-reduced-motion: reduce) { .cell { animation: none; opacity: 1; } }
    .total { font: 600 13px "Segoe UI", sans-serif; fill: ${GOLD}; }
  </style>
  <rect width="100%" height="100%" fill="${BG}" rx="8"/>
  <text x="${padLeft}" y="18" class="total">${total} contribuições no último ano</text>
  ${cells}
</svg>`;
}

function buildNeofetchSvg({ total, days }, profile) {
  const activeDays = days.filter((d) => d.level > 0).length;
  let streak = 0;
  for (let i = days.length - 1; i >= 0; i--) {
    if (days[i].level > 0) streak++;
    else break;
  }
  const lines = [
    { k: "usuario", v: USER },
    { k: "linguagens", v: "TypeScript · JavaScript · Python" },
    { k: "frontend", v: "React · Vite · Tailwind" },
    { k: "backend/dados", v: "Node.js · Supabase · PostgreSQL" },
    { k: "mobile", v: "React Native / Expo" },
    { k: "infra", v: "Docker · GitHub Actions" },
    { k: "seguranca", v: "SAST, secret scan, pentest com IA" },
    { k: "repos publicos", v: String(profile.public_repos) },
    { k: "contribuicoes/ano", v: total },
    { k: "dias ativos/ano", v: String(activeDays) },
    { k: "streak atual", v: `${streak} dia${streak === 1 ? "" : "s"}` },
  ];

  const width = 620;
  const lineHeight = 24;
  const padTop = 34;
  const height = padTop + lines.length * lineHeight + 18;

  const rows = lines
    .map((l, i) => {
      const y = padTop + i * lineHeight;
      const delay = (i * 0.1).toFixed(2);
      return `<g class="row" style="animation-delay:${delay}s"><text x="24" y="${y}" class="key">${esc(l.k)}</text><text x="200" y="${y}" class="val">${esc(l.v)}</text></g>`;
    })
    .join("\n");

  return `<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Cartão de status estilo terminal">
  <style>
    .row { opacity: 0; animation: slidein 0.4s ease-out forwards; }
    @keyframes slidein { 0% { opacity: 0; transform: translateX(-14px); } 100% { opacity: 1; transform: translateX(0); } }
    @media (prefers-reduced-motion: reduce) { .row { animation: none; opacity: 1; } }
    .prompt { font: 600 13px "Cascadia Code","Fira Code",monospace; fill: ${GOLD}; }
    .key { font: 400 13px "Cascadia Code","Fira Code",monospace; fill: ${MUTED}; }
    .val { font: 600 13px "Cascadia Code","Fira Code",monospace; fill: ${INK}; }
    .cursor { fill: ${GOLD}; animation: blink 1s step-end infinite; }
    @keyframes blink { 50% { opacity: 0; } }
  </style>
  <rect width="100%" height="100%" fill="${BG}" rx="8"/>
  <rect x="0.5" y="0.5" width="${width - 1}" height="${height - 1}" rx="8" fill="none" stroke="${GOLD_DIM}"/>
  <text x="24" y="20" class="prompt">wilkerio@dev:~$ whoami --verbose</text>
  ${rows}
  <rect class="cursor" x="24" y="${height - 16}" width="8" height="14"/>
</svg>`;
}

// Header — assinatura visual: wordmark grande em moldura de terminal,
// cursor piscando, tagline datilografada depois. Um só momento orquestrado.
function buildHeaderSvg() {
  const width = 900;
  const height = 220;
  const mark = "WILKERIO";
  const tagline = "full-stack engineer & application security";
  const sub = "Construo o sistema e depois tento invadir ele.";

  return `<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Wilkerio — full-stack engineer e segurança de aplicações">
  <style>
    .bracket { stroke: ${GOLD_DIM}; stroke-width: 2; fill: none; }
    .mark { font: 700 64px Georgia, "Times New Roman", serif; fill: ${GOLD}; letter-spacing: 4px; opacity: 0; animation: reveal 0.25s ease-out forwards; animation-delay: 0.05s; }
    .tag { font: 400 16px "Cascadia Code","Fira Code",monospace; fill: ${INK}; opacity: 0; animation: reveal 0.2s ease-out forwards; animation-delay: 0.2s; }
    .sub { font: 400 14px "Cascadia Code","Fira Code",monospace; fill: ${MUTED}; opacity: 0; animation: reveal 0.2s ease-out forwards; animation-delay: 0.32s; }
    @keyframes reveal { 0% { opacity: 0; transform: translateX(-6px); } 100% { opacity: 1; transform: translateX(0); } }
    .cursor { fill: ${GOLD}; opacity: 0; animation: blink 1s step-end infinite; animation-delay: 0.5s; }
    @media (prefers-reduced-motion: reduce) {
      .mark, .tag, .sub { animation: none !important; opacity: 1 !important; }
      .cursor { opacity: 1; animation: blink 1s step-end infinite; }
    }
  </style>
  <rect width="100%" height="100%" fill="${BG}" rx="10"/>

  <!-- moldura estilo terminal -->
  <path class="bracket" d="M 28 24 L 16 24 L 16 ${height - 24} L 28 ${height - 24}"/>
  <path class="bracket" d="M ${width - 28} 24 L ${width - 16} 24 L ${width - 16} ${height - 24} L ${width - 28} ${height - 24}"/>

  <g transform="translate(64, 68)">
    <text x="0" y="0" class="mark">${esc(mark)}</text>
    <text x="0" y="34" class="tag">${esc(tagline)}</text>
    <text x="0" y="64" class="sub">${esc(sub)}</text>
    <rect class="cursor" x="0" y="52" width="9" height="16"/>
  </g>
</svg>`;
}

// Ícones reais (simple-icons), montados num grid próprio com reveal animado —
// troca a imagem estática do skillicons.dev por algo nosso, versionado, com animação.
const STACK = [
  ["html5", "HTML"], ["css", "CSS"], ["javascript", "JavaScript"], ["typescript", "TypeScript"],
  ["react", "React"], ["vite", "Vite"], ["tailwindcss", "Tailwind"], ["nodedotjs", "Node.js"],
  ["python", "Python"], ["supabase", "Supabase"], ["postgresql", "PostgreSQL"], ["docker", "Docker"],
  ["git", "Git"], ["github", "GitHub"], ["githubactions", "Actions"], ["figma", "Figma"],
  ["gnubash", "Bash"], ["linux", "Linux"],
];

async function fetchIcon(slug) {
  const res = await fetch(`https://cdn.simpleicons.org/${slug}`);
  const svg = await res.text();
  const fill = (svg.match(/fill="([^"]+)"/) || [, GOLD])[1];
  const viewBox = (svg.match(/viewBox="([^"]+)"/) || [, "0 0 24 24"])[1];
  const paths = [...svg.matchAll(/<path[^>]*d="[^"]*"[^>]*>/g)].map((m) => m[0]).join("");
  return { fill, viewBox, paths };
}

async function buildStackSvg() {
  const perRow = 9;
  const cell = 84;
  const iconSize = 34;
  const padTop = 20;
  const padLeft = 20;
  const rows = Math.ceil(STACK.length / perRow);
  const width = padLeft * 2 + perRow * cell;
  const height = padTop * 2 + rows * cell;

  const icons = await Promise.all(STACK.map(([slug]) => fetchIcon(slug).catch(() => null)));

  let content = "";
  STACK.forEach(([, label], i) => {
    const icon = icons[i];
    if (!icon) return;
    const col = i % perRow;
    const row = Math.floor(i / perRow);
    const cx = padLeft + col * cell + cell / 2;
    const cy = padTop + row * cell + cell / 2 - 6;
    const [, , vw, vh] = icon.viewBox.split(" ").map(Number);
    const scale = iconSize / Math.max(vw, vh);
    const delay = (i * 0.045).toFixed(3);
    content += `<g class="icon" style="animation-delay:${delay}s" transform="translate(${cx}, ${cy})">
      <rect x="-${cell / 2 - 6}" y="-${cell / 2 - 6}" width="${cell - 12}" height="${cell - 12}" rx="12" fill="#161b22"/>
      <g transform="translate(${-iconSize / 2}, ${-iconSize / 2 - 6}) scale(${scale})" fill="#${icon.fill.replace("#", "")}">${icon.paths}</g>
      <text x="0" y="${cell / 2 - 14}" text-anchor="middle" class="label">${esc(label)}</text>
    </g>\n`;
  });

  return `<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Linguagens e ferramentas">
  <style>
    .icon { opacity: 0; animation: pop 0.4s ease-out forwards; transform-origin: center; }
    @keyframes pop { 0% { opacity: 0; transform: scale(0.5) translateY(6px); } 100% { opacity: 1; transform: scale(1) translateY(0); } }
    .label { font: 500 9px "Cascadia Code","Fira Code",monospace; fill: ${MUTED}; }
    @media (prefers-reduced-motion: reduce) { .icon { animation: none; opacity: 1; } }
  </style>
  <rect width="100%" height="100%" fill="${BG}" rx="10"/>
  ${content}
</svg>`;
}

const contrib = await fetchContributions();
const profile = await fetchPublicProfile();
const stackSvg = await buildStackSvg();

mkdirSync(new URL("..", import.meta.url), { recursive: true });
writeFileSync(new URL("../heatmap.svg", import.meta.url), buildHeatmapSvg(contrib));
writeFileSync(new URL("../neofetch.svg", import.meta.url), buildNeofetchSvg(contrib, profile));
writeFileSync(new URL("../header.svg", import.meta.url), buildHeaderSvg());
writeFileSync(new URL("../stack.svg", import.meta.url), stackSvg);

console.log(`OK — ${contrib.total} contribuições, ${contrib.days.length} dias, repos=${profile.public_repos}`);
