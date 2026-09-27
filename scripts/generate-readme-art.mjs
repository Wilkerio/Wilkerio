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
    { k: "stack", v: "TypeScript · React · Node · Python" },
    { k: "seguranca", v: "SAST, secret scan, pentest com IA" },
    { k: "mobile", v: "React Native / Expo" },
    { k: "repos publicos", v: String(profile.public_repos) },
    { k: "contribuicoes/ano", v: total },
    { k: "dias ativos/ano", v: String(activeDays) },
    { k: "streak atual", v: `${streak} dia${streak === 1 ? "" : "s"}` },
  ];

  const width = 560;
  const lineHeight = 24;
  const padTop = 34;
  const height = padTop + lines.length * lineHeight + 18;

  const rows = lines
    .map((l, i) => {
      const y = padTop + i * lineHeight;
      const delay = (i * 0.1).toFixed(2);
      return `<g class="row" style="animation-delay:${delay}s"><text x="24" y="${y}" class="key">${l.k}</text><text x="200" y="${y}" class="val">${l.v}</text></g>`;
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
  <text x="24" y="20" class="prompt">wilkerio@gervia:~$ whoami --verbose</text>
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

  const markCharW = 46;
  const markWidth = mark.length * markCharW;
  const tagCharW = 11.5;
  const tagWidth = tagline.length * tagCharW;
  const subCharW = 10.2;
  const subWidth = sub.length * subCharW;

  const markDur = 1.1;
  const tagDelay = markDur + 0.15;
  const tagDur = tagline.length * 0.028;
  const subDelay = tagDelay + tagDur + 0.3;
  const subDur = sub.length * 0.03;
  const cursorDelay = subDelay + subDur + 0.1;

  return `<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Wilkerio — full-stack engineer e segurança de aplicações">
  <style>
    .bracket { stroke: ${GOLD_DIM}; stroke-width: 2; fill: none; }
    .mark { font: 700 64px Georgia, "Times New Roman", serif; fill: ${GOLD}; letter-spacing: 4px; }
    .tag { font: 400 16px "Cascadia Code","Fira Code",monospace; fill: ${INK}; }
    .sub { font: 400 14px "Cascadia Code","Fira Code",monospace; fill: ${MUTED}; }
    .cursor { fill: ${GOLD}; opacity: 0; animation: blink 1s step-end infinite; animation-delay: ${cursorDelay}s; }
    @media (prefers-reduced-motion: reduce) {
      #markClip rect, #tagClip rect, #subClip rect { animation: none !important; width: 2000px !important; }
      .cursor { opacity: 1; animation: blink 1s step-end infinite; }
    }
  </style>
  <rect width="100%" height="100%" fill="${BG}" rx="10"/>

  <!-- moldura estilo terminal -->
  <path class="bracket" d="M 28 24 L 16 24 L 16 ${height - 24} L 28 ${height - 24}"/>
  <path class="bracket" d="M ${width - 28} 24 L ${width - 16} 24 L ${width - 16} ${height - 24} L ${width - 28} ${height - 24}"/>

  <defs>
    <clipPath id="markClip">
      <rect x="0" y="0" height="76" width="0">
        <animate attributeName="width" from="0" to="${markWidth}" begin="0.1s" dur="${markDur}s" fill="freeze" calcMode="ease-out"/>
      </rect>
    </clipPath>
    <clipPath id="tagClip">
      <rect x="0" y="0" height="24" width="0">
        <animate attributeName="width" from="0" to="${tagWidth}" begin="${tagDelay}s" dur="${tagDur}s" fill="freeze" calcMode="linear"/>
      </rect>
    </clipPath>
    <clipPath id="subClip">
      <rect x="0" y="0" height="22" width="0">
        <animate attributeName="width" from="0" to="${subWidth}" begin="${subDelay}s" dur="${subDur}s" fill="freeze" calcMode="linear"/>
      </rect>
    </clipPath>
  </defs>

  <g transform="translate(64, 68)">
    <text x="0" y="0" class="mark" clip-path="url(#markClip)">${mark}</text>
    <text x="0" y="34" class="tag" clip-path="url(#tagClip)">${tagline}</text>
    <text x="0" y="64" class="sub" clip-path="url(#subClip)">${sub}</text>
    <rect class="cursor" x="0" y="52" width="9" height="16"/>
  </g>
</svg>`;
}

const contrib = await fetchContributions();
const profile = await fetchPublicProfile();

mkdirSync(new URL("..", import.meta.url), { recursive: true });
writeFileSync(new URL("../heatmap.svg", import.meta.url), buildHeatmapSvg(contrib));
writeFileSync(new URL("../neofetch.svg", import.meta.url), buildNeofetchSvg(contrib, profile));
writeFileSync(new URL("../header.svg", import.meta.url), buildHeaderSvg());

console.log(`OK — ${contrib.total} contribuições, ${contrib.days.length} dias, repos=${profile.public_repos}`);
