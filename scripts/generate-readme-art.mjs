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

async function fetchLanguages() {
  if (!TOKEN) return null; // GraphQL exige token; sem ele, pula esse gráfico (não trava o resto).
  // privacy: PUBLIC de propósito — nunca expor composição de stack de repo privado de cliente num perfil público.
  const query = `query { user(login: "${USER}") { repositories(first:100, ownerAffiliations: OWNER, isFork: false, privacy: PUBLIC) { nodes { languages(first:10, orderBy: {field: SIZE, direction: DESC}) { edges { size node { name color } } } } } } }`;
  const res = await fetch("https://api.github.com/graphql", {
    method: "POST",
    headers: { "Content-Type": "application/json", "User-Agent": "gervia-readme-art", ...AUTH_HEADERS },
    body: JSON.stringify({ query }),
  });
  const json = await res.json();
  if (json.errors) throw new Error(JSON.stringify(json.errors));
  const totals = {};
  json.data.user.repositories.nodes.forEach((r) => {
    r.languages.edges.forEach((e) => {
      totals[e.node.name] = totals[e.node.name] || { size: 0, color: e.node.color || MUTED };
      totals[e.node.name].size += e.size;
    });
  });
  const NOT_A_LANGUAGE = new Set(["Procfile", "Dockerfile"]);
  return Object.entries(totals)
    .filter(([name]) => !NOT_A_LANGUAGE.has(name))
    .sort((a, b) => b[1].size - a[1].size);
}

function buildLanguagesSvg(langs) {
  const top = langs.slice(0, 7);
  const restSize = langs.slice(7).reduce((s, [, v]) => s + v.size, 0);
  if (restSize > 0) top.push(["Outros", { size: restSize, color: "#484f58" }]);
  const total = top.reduce((s, [, v]) => s + v.size, 0);

  const width = 700;
  const barHeight = 14;
  const barY = 36;

  let x = 0;
  let barSegments = "";
  let legend = "";
  top.forEach(([name, v], i) => {
    const pct = v.size / total;
    const segWidth = pct * width;
    const delay = (i * 0.08).toFixed(2);
    barSegments += `<g transform="translate(${x}, ${barY})"><rect class="seg" style="animation-delay:${delay}s" width="${segWidth}" height="${barHeight}" fill="${v.color}"/></g>\n`;
    x += segWidth;

    const col = i % 4;
    const row = Math.floor(i / 4);
    const lx = col * 175;
    const ly = row * 24;
    const legDelay = (0.6 + i * 0.05).toFixed(2);
    legend += `<g class="leg" style="animation-delay:${legDelay}s" transform="translate(${lx}, ${ly})">
      <rect width="10" height="10" y="-9" rx="2" fill="${v.color}"/>
      <text x="16" y="0" class="leg-name">${esc(name)}</text>
      <text x="16" y="14" class="leg-pct">${(pct * 100).toFixed(1)}%</text>
    </g>\n`;
  });

  const legendRows = Math.ceil(top.length / 4);
  const height = barY + barHeight + 30 + legendRows * 34;

  return `<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Distribuição de linguagem nos repositórios">
  <style>
    .title { font: 600 12px "Cascadia Code","Fira Code",monospace; fill: ${MUTED}; letter-spacing: 1px; }
    .seg { opacity: 0; transform-origin: left; animation: growBar 0.5s ease-out forwards; }
    @keyframes growBar { 0% { opacity: 0; transform: scaleX(0); } 100% { opacity: 1; transform: scaleX(1); } }
    .leg { opacity: 0; animation: reveal 0.3s ease-out forwards; }
    @keyframes reveal { to { opacity: 1; } }
    .leg-name { font: 500 12px "Cascadia Code","Fira Code",monospace; fill: ${INK}; }
    .leg-pct { font: 400 11px "Cascadia Code","Fira Code",monospace; fill: ${MUTED}; }
    @media (prefers-reduced-motion: reduce) { .seg, .leg { animation: none; opacity: 1; } }
  </style>
  <rect width="100%" height="100%" fill="${BG}" rx="10"/>
  <text x="0" y="18" class="title">DISTRIBUIÇÃO DE LINGUAGEM NOS REPOSITÓRIOS (bytes de código real)</text>
  <g clip-path="inset(0 round 4px)">
    <rect x="0" y="${barY}" width="${width}" height="${barHeight}" fill="#161b22"/>
    ${barSegments}
  </g>
  <g transform="translate(0, ${barY + barHeight + 34})">
    ${legend}
  </g>
</svg>`;
}

// Badges nossos (duas cores, cantos arredondados de verdade) em vez do shields.io —
// mesma tipografia/paleta do resto do perfil, altura consistente.
function measure(text, size) {
  return text.length * size * 0.6;
}

function buildBadgeRowSvg(title, items) {
  const fontSize = 12;
  const padX = 10;
  const gap = 8;
  const badgeH = 26;
  const maxWidth = 860;

  const badges = items.map(([label, value, color]) => {
    const labelW = measure(label, fontSize) + padX * 2;
    const valueW = measure(value, fontSize) + padX * 2;
    return { label, value, color: color || GOLD, labelW, valueW, w: labelW + valueW };
  });

  // quebra em linhas respeitando maxWidth
  const rows = [];
  let row = [];
  let rowW = 0;
  for (const b of badges) {
    if (rowW + b.w + gap > maxWidth && row.length) {
      rows.push(row);
      row = [];
      rowW = 0;
    }
    row.push(b);
    rowW += b.w + gap;
  }
  if (row.length) rows.push(row);

  const rowH = badgeH + 10;
  const titleH = title ? 24 : 0;
  const height = titleH + rows.length * rowH;
  const width = maxWidth;

  let content = "";
  let delayIdx = 0;
  rows.forEach((r, ri) => {
    const totalRowW = r.reduce((s, b) => s + b.w, 0) + gap * (r.length - 1);
    let x = (width - totalRowW) / 2;
    const y = titleH + ri * rowH;
    r.forEach((b) => {
      const delay = (delayIdx * 0.05).toFixed(2);
      content += `<g transform="translate(${x}, ${y})">
      <g class="badge" style="animation-delay:${delay}s">
        <rect width="${b.w}" height="${badgeH}" rx="6" fill="#161b22"/>
        <rect x="${b.labelW}" width="${b.valueW}" height="${badgeH}" rx="6" fill="${b.color}"/>
        <rect x="${b.labelW - 6}" width="6" height="${badgeH}" fill="${b.color}"/>
        <text x="${padX}" y="${badgeH / 2 + 4}" class="bl">${esc(b.label)}</text>
        <text x="${b.labelW + padX}" y="${badgeH / 2 + 4}" class="bv">${esc(b.value)}</text>
      </g>
      </g>\n`;
      x += b.w + gap;
      delayIdx++;
    });
  });

  return `<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="${esc(title || "badges")}">
  <style>
    .eyebrow { font: 600 11px "Cascadia Code","Fira Code",monospace; fill: ${GOLD_DIM}; letter-spacing: 2px; }
    .bl { font: 500 12px "Cascadia Code","Fira Code",monospace; fill: ${INK}; }
    .bv { font: 700 12px "Cascadia Code","Fira Code",monospace; fill: ${BG}; }
    .badge { opacity: 0; animation: pop 0.3s ease-out forwards; transform-origin: center; }
    @keyframes pop { 0% { opacity: 0; transform: scale(0.85); } 100% { opacity: 1; transform: scale(1); } }
    @media (prefers-reduced-motion: reduce) { .badge { animation: none; opacity: 1; } }
  </style>
  <rect width="100%" height="100%" fill="${BG}" rx="10"/>
  ${title ? `<text x="${width / 2}" y="16" text-anchor="middle" class="eyebrow">${esc(title)}</text>` : ""}
  ${content}
</svg>`;
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
  const focus = [
    "SaaS multi-tenant (Supabase / RLS)",
    "Pentest com agente de IA (Strix)",
    "CI/CD com gates de segurança",
    "Full-stack TypeScript / React / Node",
  ];
  const dividerX = 528;

  const focusRows = focus
    .map((f, i) => {
      const delay = (0.55 + i * 0.1).toFixed(2);
      return `<g class="focus-row" style="animation-delay:${delay}s"><text x="0" y="${i * 26}" class="focus-mark">›</text><text x="16" y="${i * 26}" class="focus">${esc(f)}</text></g>`;
    })
    .join("\n");

  return `<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Wilkerio — full-stack engineer e segurança de aplicações">
  <defs>
    <radialGradient id="glow" cx="30%" cy="38%" r="75%">
      <stop offset="0%" stop-color="#2a2010" stop-opacity="0.9"/>
      <stop offset="55%" stop-color="${BG}" stop-opacity="1"/>
      <stop offset="100%" stop-color="${BG}"/>
    </radialGradient>
    <linearGradient id="rule" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0%" stop-color="${GOLD}" stop-opacity="0.9"/>
      <stop offset="100%" stop-color="${GOLD}" stop-opacity="0"/>
    </linearGradient>
    <linearGradient id="divider" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="${GOLD_DIM}" stop-opacity="0"/>
      <stop offset="50%" stop-color="${GOLD_DIM}" stop-opacity="0.8"/>
      <stop offset="100%" stop-color="${GOLD_DIM}" stop-opacity="0"/>
    </linearGradient>
  </defs>
  <style>
    .bracket { stroke: ${GOLD_DIM}; stroke-width: 2; fill: none; }
    .dot { opacity: 0.85; }
    .mark { font: 700 66px Georgia, "Times New Roman", serif; fill: ${GOLD}; letter-spacing: 4px; opacity: 0; animation: reveal 0.25s ease-out forwards; animation-delay: 0.05s; }
    .tag { font: 400 16px "Cascadia Code","Fira Code",monospace; fill: ${INK}; opacity: 0; animation: reveal 0.2s ease-out forwards; animation-delay: 0.2s; }
    .sub { font: 400 14px "Cascadia Code","Fira Code",monospace; fill: ${MUTED}; opacity: 0; animation: reveal 0.2s ease-out forwards; animation-delay: 0.32s; }
    @keyframes reveal { 0% { opacity: 0; transform: translateX(-6px); } 100% { opacity: 1; transform: translateX(0); } }
    .rule-anim { transform-origin: left; transform: scaleX(0); animation: growRule 0.5s ease-out forwards; animation-delay: 0.4s; }
    @keyframes growRule { to { transform: scaleX(1); } }
    .cursor { fill: ${GOLD}; opacity: 0; animation: blink 1s step-end infinite; animation-delay: 0.5s; }
    .eyebrow { font: 600 11px "Cascadia Code","Fira Code",monospace; fill: ${GOLD_DIM}; letter-spacing: 2px; opacity: 0; animation: reveal 0.2s ease-out forwards; animation-delay: 0.48s; }
    .focus-row { opacity: 0; animation: reveal 0.25s ease-out forwards; }
    .focus-mark { font: 600 13px "Cascadia Code","Fira Code",monospace; fill: ${GOLD}; }
    .focus { font: 400 13px "Cascadia Code","Fira Code",monospace; fill: ${INK}; }
    @media (prefers-reduced-motion: reduce) {
      .mark, .tag, .sub, .eyebrow, .focus-row { animation: none !important; opacity: 1 !important; }
      .rule-anim { animation: none !important; transform: scaleX(1); }
      .cursor { opacity: 1; animation: blink 1s step-end infinite; }
    }
  </style>
  <rect width="100%" height="100%" fill="url(#glow)" rx="10"/>

  <!-- pontos de janela de terminal -->
  <circle class="dot" cx="44" cy="40" r="5" fill="${GOLD_DIM}"/>
  <circle class="dot" cx="62" cy="40" r="5" fill="${BLUE_LIGHT}"/>
  <circle class="dot" cx="80" cy="40" r="5" fill="${GOLD}"/>

  <!-- moldura estilo terminal -->
  <path class="bracket" d="M 28 24 L 16 24 L 16 ${height - 24} L 28 ${height - 24}"/>
  <path class="bracket" d="M ${width - 28} 24 L ${width - 16} 24 L ${width - 16} ${height - 24} L ${width - 28} ${height - 24}"/>

  <!-- divisor central -->
  <rect x="${dividerX}" y="30" width="1" height="${height - 60}" fill="url(#divider)"/>

  <g transform="translate(${dividerX + 40}, 78)">
    <text x="0" y="0" class="eyebrow">FOCO</text>
    <g transform="translate(0, 22)">
      ${focusRows}
    </g>
  </g>

  <g transform="translate(64, 100)">
    <text x="0" y="0" class="mark">${esc(mark)}</text>
    <rect class="rule-anim" x="0" y="14" width="${dividerX - 64 - 64}" height="2" fill="url(#rule)"/>
    <text x="0" y="42" class="tag">${esc(tagline)}</text>
    <text x="0" y="72" class="sub">${esc(sub)}</text>
    <rect class="cursor" x="0" y="60" width="9" height="16"/>
  </g>
</svg>`;
}

// Ícones reais (simple-icons), montados num grid próprio com reveal animado —
// troca a imagem estática do skillicons.dev por algo nosso, versionado, com animação.
// slug, rótulo, cor oficial da marca (verificada em simple-icons/data — não vem do
// serviço de render cdn.simpleicons.org, que rate-limita fácil; path vem do CDN do
// npm/jsdelivr, cor vem embutida aqui).
const STACK = [
  ["html5", "HTML", "E34F26"], ["css", "CSS", "663399"], ["javascript", "JavaScript", "F7DF1E"],
  ["typescript", "TypeScript", "3178C6"], ["react", "React", "61DAFB"], ["vite", "Vite", "9135FF"],
  ["tailwindcss", "Tailwind", "06B6D4"], ["nodedotjs", "Node.js", "5FA04E"], ["python", "Python", "3776AB"],
  ["supabase", "Supabase", "3FCF8E"], ["postgresql", "PostgreSQL", "4169E1"], ["docker", "Docker", "2496ED"],
  ["git", "Git", "F03C2E"], ["github", "GitHub", "FFFFFF"], ["githubactions", "Actions", "2088FF"],
  ["figma", "Figma", "F24E1E"], ["gnubash", "Bash", "4EAA25"], ["linux", "Linux", "FCC624"],
  ["java", "Java", "ED8B00"], ["php", "PHP", "777BB4"], ["cplusplus", "C++", "00599C"],
];

async function fetchIcon(slug) {
  const res = await fetch(`https://cdn.jsdelivr.net/npm/simple-icons@latest/icons/${slug}.svg`);
  if (!res.ok) throw new Error(`${slug}: HTTP ${res.status}`);
  const svg = await res.text();
  const viewBox = (svg.match(/viewBox="([^"]+)"/) || [, "0 0 24 24"])[1];
  const paths = [...svg.matchAll(/<path[^>]*d="[^"]*"[^>]*>/g)].map((m) => m[0]).join("");
  if (!paths) throw new Error(`${slug}: sem path`);
  return { viewBox, paths };
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

  const icons = await Promise.all(STACK.map(([slug]) => fetchIcon(slug).catch((e) => { console.error(String(e)); return null; })));
  const okCount = icons.filter(Boolean).length;
  if (okCount < STACK.length) {
    console.error(`Aviso: só ${okCount}/${STACK.length} ícones carregaram — não vou publicar grid incompleto.`);
    if (okCount < STACK.length * 0.8) throw new Error("Falha demais buscando ícones — abortando geração de stack.svg");
  }

  let content = "";
  STACK.forEach(([, label, hex], i) => {
    const icon = icons[i];
    if (!icon) return;
    const col = i % perRow;
    const row = Math.floor(i / perRow);
    const cx = padLeft + col * cell + cell / 2;
    const cy = padTop + row * cell + cell / 2 - 6;
    const [, , vw, vh] = icon.viewBox.split(" ").map(Number);
    const scale = iconSize / Math.max(vw, vh);
    const delay = (i * 0.045).toFixed(3);
    content += `<g transform="translate(${cx}, ${cy})">
      <g class="icon" style="animation-delay:${delay}s">
        <rect x="-${cell / 2 - 6}" y="-${cell / 2 - 6}" width="${cell - 12}" height="${cell - 12}" rx="12" fill="#161b22"/>
        <g transform="translate(${-iconSize / 2}, ${-iconSize / 2 - 6}) scale(${scale})" fill="#${hex}">${icon.paths}</g>
        <text x="0" y="${cell / 2 - 14}" text-anchor="middle" class="label">${esc(label)}</text>
      </g>
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

mkdirSync(new URL("..", import.meta.url), { recursive: true });
writeFileSync(new URL("../heatmap.svg", import.meta.url), buildHeatmapSvg(contrib));
writeFileSync(new URL("../neofetch.svg", import.meta.url), buildNeofetchSvg(contrib, profile));
writeFileSync(new URL("../header.svg", import.meta.url), buildHeaderSvg());

try {
  const stackSvg = await buildStackSvg();
  writeFileSync(new URL("../stack.svg", import.meta.url), stackSvg);
} catch (e) {
  console.error("stack.svg não atualizado nesta rodada:", String(e));
}

try {
  const langs = await fetchLanguages();
  if (langs && langs.length) {
    writeFileSync(new URL("../languages.svg", import.meta.url), buildLanguagesSvg(langs));
  } else {
    console.error("languages.svg não atualizado: sem token/sem dado.");
  }
} catch (e) {
  console.error("languages.svg não atualizado nesta rodada:", String(e));
}

const securityBadges = [
  ["Semgrep", "SAST", BLUE],
  ["gitleaks", "secret scan", GOLD],
  ["Nuclei", "vuln scan", BLUE],
  ["Strix", "AI pentest", GOLD],
  ["Playwright", "E2E", BLUE],
  ["OWASP", "ASVS", GOLD],
  ["RLS", "isolamento multi-tenant", GOLD],
  ["Claude Code", "Anthropic", GOLD],
  ["DeepSeek", "LLM", BLUE],
];
writeFileSync(new URL("../badges.svg", import.meta.url), buildBadgeRowSvg("SEGURANÇA & IA", securityBadges));

console.log(`OK — ${contrib.total} contribuições, ${contrib.days.length} dias, repos=${profile.public_repos}`);
