/* Daily profile refresh, run by the GitHub Action with GITHUB_TOKEN only.
   1) latest blog posts from RSS -> README BLOG section
   2) cards drawn as SVG in GitHub's own palette, light + dark, one grid:
      - project cards from assets/projects.json (+ per-repo languages)
      - most used languages from assets/languages.json
        (both JSON files come from scripts/languages.mjs, run by hand)
      - contribution skyline, commits by time of day, GitHub stats
   3) every README image URL gets ?v=<content hash>, so a changed card is
      never served stale from the browser cache.
   Grid: half cards are 452 wide, full cards 904, all with a 10px inset,
   so two halves at 50% line up with one full card at 100%.
   `--languages` renders only what needs no token (projects, languages). */
import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

process.chdir(fileURLToPath(new URL("..", import.meta.url)));
const ONLY_LANGUAGES = process.argv.includes("--languages");
const LOGIN = "Seok05";
const token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN || "";

const THEMES = {
  light: { bg: "#ffffff", border: "#d0d7de", ink: "#1f2328", muted: "#656d76", faint: "#8b949e", accent: "#0969da", track: "#eff2f5", topic: "#ddf4ff" },
  dark: { bg: "#0d1117", border: "#30363d", ink: "#e6edf3", muted: "#8d96a0", faint: "#6e7681", accent: "#4493f8", track: "#21262d", topic: "#121d2f" },
};
const MONO = "'SFMono-Regular',Consolas,'Liberation Mono',Menlo,monospace";
const SANS = "-apple-system,BlinkMacSystemFont,'Segoe UI','Noto Sans',Helvetica,Arial,sans-serif";
const IN = 10; // side inset inside each viewBox
const PAD = IN + 24; // content left edge

// Octicons 16px by GitHub (MIT), inlined so the Action never fetches them
const ICONS = {
  "beaker": ["M5 5.782V2.5h-.25a.75.75 0 0 1 0-1.5h6.5a.75.75 0 0 1 0 1.5H11v3.282l3.666 5.76C15.619 13.04 14.543 15 12.767 15H3.233c-1.776 0-2.852-1.96-1.899-3.458Zm-2.4 6.565a.75.75 0 0 0 .633 1.153h9.534a.75.75 0 0 0 .633-1.153L12.225 10.5h-8.45ZM9.5 2.5h-3V6c0 .143-.04.283-.117.403L4.73 9h6.54L9.617 6.403A.746.746 0 0 1 9.5 6Z"],
  "calendar": ["M4.75 0a.75.75 0 0 1 .75.75V2h5V.75a.75.75 0 0 1 1.5 0V2h1.25c.966 0 1.75.784 1.75 1.75v10.5A1.75 1.75 0 0 1 13.25 16H2.75A1.75 1.75 0 0 1 1 14.25V3.75C1 2.784 1.784 2 2.75 2H4V.75A.75.75 0 0 1 4.75 0ZM2.5 7.5v6.75c0 .138.112.25.25.25h10.5a.25.25 0 0 0 .25-.25V7.5Zm10.75-4H2.75a.25.25 0 0 0-.25.25V6h11V3.75a.25.25 0 0 0-.25-.25Z"],
  "code": ["m11.28 3.22 4.25 4.25a.75.75 0 0 1 0 1.06l-4.25 4.25a.749.749 0 0 1-1.275-.326.749.749 0 0 1 .215-.734L13.94 8l-3.72-3.72a.749.749 0 0 1 .326-1.275.749.749 0 0 1 .734.215Zm-6.56 0a.751.751 0 0 1 1.042.018.751.751 0 0 1 .018 1.042L2.06 8l3.72 3.72a.749.749 0 0 1-.326 1.275.749.749 0 0 1-.734-.215L.47 8.53a.75.75 0 0 1 0-1.06Z"],
  "flame": ["M9.533.753V.752c.217 2.385 1.463 3.626 2.653 4.81C13.37 6.74 14.498 7.863 14.498 10c0 3.5-3 6-6.5 6S1.5 13.512 1.5 10c0-1.298.536-2.56 1.425-3.286.376-.308.862 0 1.035.454C4.46 8.487 5.581 8.419 6 8c.282-.282.341-.811-.003-1.5C4.34 3.187 7.035.75 8.77.146c.39-.137.726.194.763.607ZM7.998 14.5c2.832 0 5-1.98 5-4.5 0-1.463-.68-2.19-1.879-3.383l-.036-.037c-1.013-1.008-2.3-2.29-2.834-4.434-.322.256-.63.579-.864.953-.432.696-.621 1.58-.046 2.73.473.947.67 2.284-.278 3.232-.61.61-1.545.84-2.403.633a2.79 2.79 0 0 1-1.436-.874A3.198 3.198 0 0 0 3 10c0 2.53 2.164 4.5 4.998 4.5Z"],
  "git-commit": ["M11.93 8.5a4.002 4.002 0 0 1-7.86 0H.75a.75.75 0 0 1 0-1.5h3.32a4.002 4.002 0 0 1 7.86 0h3.32a.75.75 0 0 1 0 1.5Zm-1.43-.75a2.5 2.5 0 1 0-5 0 2.5 2.5 0 0 0 5 0Z"],
  "git-pull-request": ["M1.5 3.25a2.25 2.25 0 1 1 3 2.122v5.256a2.251 2.251 0 1 1-1.5 0V5.372A2.25 2.25 0 0 1 1.5 3.25Zm5.677-.177L9.573.677A.25.25 0 0 1 10 .854V2.5h1A2.5 2.5 0 0 1 13.5 5v5.628a2.251 2.251 0 1 1-1.5 0V5a1 1 0 0 0-1-1h-1v1.646a.25.25 0 0 1-.427.177L7.177 3.427a.25.25 0 0 1 0-.354ZM3.75 2.5a.75.75 0 1 0 0 1.5.75.75 0 0 0 0-1.5Zm0 9.5a.75.75 0 1 0 0 1.5.75.75 0 0 0 0-1.5Zm8.25.75a.75.75 0 1 0 1.5 0 .75.75 0 0 0-1.5 0Z"],
  "graph": ["M1.5 1.75V13.5h13.75a.75.75 0 0 1 0 1.5H.75a.75.75 0 0 1-.75-.75V1.75a.75.75 0 0 1 1.5 0Zm14.28 2.53-5.25 5.25a.75.75 0 0 1-1.06 0L7 7.06 4.28 9.78a.751.751 0 0 1-1.042-.018.751.751 0 0 1-.018-1.042l3.25-3.25a.75.75 0 0 1 1.06 0L10 7.94l4.72-4.72a.751.751 0 0 1 1.042.018.751.751 0 0 1 .018 1.042Z"],
  "issue-opened": ["M8 9.5a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3Z", "M8 0a8 8 0 1 1 0 16A8 8 0 0 1 8 0ZM1.5 8a6.5 6.5 0 1 0 13 0 6.5 6.5 0 0 0-13 0Z"],
  "mark-github": ["M8 0c4.42 0 8 3.58 8 8a8.013 8.013 0 0 1-5.45 7.59c-.4.08-.55-.17-.55-.38 0-.27.01-1.13.01-2.2 0-.75-.25-1.23-.54-1.48 1.78-.2 3.65-.88 3.65-3.95 0-.88-.31-1.59-.82-2.15.08-.2.36-1.02-.08-2.12 0 0-.67-.22-2.2.82-.64-.18-1.32-.27-2-.27-.68 0-1.36.09-2 .27-1.53-1.03-2.2-.82-2.2-.82-.44 1.1-.16 1.92-.08 2.12-.51.56-.82 1.28-.82 2.15 0 3.06 1.86 3.75 3.64 3.95-.23.2-.44.55-.51 1.07-.46.21-1.61.55-2.33-.66-.15-.24-.6-.83-1.23-.82-.67.01-.27.38.01.53.34.19.73.9.82 1.13.16.45.68 1.31 2.69.94 0 .67.01 1.3.01 1.49 0 .21-.15.45-.55.38A7.995 7.995 0 0 1 0 8c0-4.42 3.58-8 8-8Z"],
  "moon": ["M9.598 1.591a.749.749 0 0 1 .785-.175 7.001 7.001 0 1 1-8.967 8.967.75.75 0 0 1 .961-.96 5.5 5.5 0 0 0 7.046-7.046.75.75 0 0 1 .175-.786Zm1.616 1.945a7 7 0 0 1-7.678 7.678 5.499 5.499 0 1 0 7.678-7.678Z"],
  "pulse": ["M6 2c.306 0 .582.187.696.471L10 10.731l1.304-3.26A.751.751 0 0 1 12 7h3.25a.75.75 0 0 1 0 1.5h-2.742l-1.812 4.528a.751.751 0 0 1-1.392 0L6 4.77 4.696 8.03A.75.75 0 0 1 4 8.5H.75a.75.75 0 0 1 0-1.5h2.742l1.812-4.529A.751.751 0 0 1 6 2Z"],
  "repo": ["M2 2.5A2.5 2.5 0 0 1 4.5 0h8.75a.75.75 0 0 1 .75.75v12.5a.75.75 0 0 1-.75.75h-2.5a.75.75 0 0 1 0-1.5h1.75v-2h-8a1 1 0 0 0-.714 1.7.75.75 0 1 1-1.072 1.05A2.495 2.495 0 0 1 2 11.5Zm10.5-1h-8a1 1 0 0 0-1 1v6.708A2.486 2.486 0 0 1 4.5 9h8ZM5 12.25a.25.25 0 0 1 .25-.25h3.5a.25.25 0 0 1 .25.25v3.25a.25.25 0 0 1-.4.2l-1.45-1.087a.249.249 0 0 0-.3 0L5.4 15.7a.25.25 0 0 1-.4-.2Z"],
  "star": ["M8 .25a.75.75 0 0 1 .673.418l1.882 3.815 4.21.612a.75.75 0 0 1 .416 1.279l-3.046 2.97.719 4.192a.751.751 0 0 1-1.088.791L8 12.347l-3.766 1.98a.75.75 0 0 1-1.088-.79l.72-4.194L.818 6.374a.75.75 0 0 1 .416-1.28l4.21-.611L7.327.668A.75.75 0 0 1 8 .25Zm0 2.445L6.615 5.5a.75.75 0 0 1-.564.41l-3.097.45 2.24 2.184a.75.75 0 0 1 .216.664l-.528 3.084 2.769-1.456a.75.75 0 0 1 .698 0l2.77 1.456-.53-3.084a.75.75 0 0 1 .216-.664l2.24-2.183-3.096-.45a.75.75 0 0 1-.564-.41L8 2.694Z"],
  "sun": ["M8 12a4 4 0 1 1 0-8 4 4 0 0 1 0 8Zm0-1.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5Zm5.657-8.157a.75.75 0 0 1 0 1.061l-1.061 1.06a.749.749 0 0 1-1.275-.326.749.749 0 0 1 .215-.734l1.06-1.06a.75.75 0 0 1 1.06 0Zm-9.193 9.193a.75.75 0 0 1 0 1.06l-1.06 1.061a.75.75 0 1 1-1.061-1.06l1.06-1.061a.75.75 0 0 1 1.061 0ZM8 0a.75.75 0 0 1 .75.75v1.5a.75.75 0 0 1-1.5 0V.75A.75.75 0 0 1 8 0ZM3 8a.75.75 0 0 1-.75.75H.75a.75.75 0 0 1 0-1.5h1.5A.75.75 0 0 1 3 8Zm13 0a.75.75 0 0 1-.75.75h-1.5a.75.75 0 0 1 0-1.5h1.5A.75.75 0 0 1 16 8Zm-8 5a.75.75 0 0 1 .75.75v1.5a.75.75 0 0 1-1.5 0v-1.5A.75.75 0 0 1 8 13Zm3.536-1.464a.75.75 0 0 1 1.06 0l1.061 1.06a.75.75 0 0 1-1.06 1.061l-1.061-1.06a.75.75 0 0 1 0-1.061ZM2.343 2.343a.75.75 0 0 1 1.061 0l1.06 1.061a.751.751 0 0 1-.018 1.042.751.751 0 0 1-1.042.018l-1.06-1.06a.75.75 0 0 1 0-1.06Z"],
  "trophy": ["M3.217 6.962A3.75 3.75 0 0 1 0 3.25v-.5C0 1.784.784 1 1.75 1h1.356c.228-.585.796-1 1.462-1h6.864c.647 0 1.227.397 1.462 1h1.356c.966 0 1.75.784 1.75 1.75v.5a3.75 3.75 0 0 1-3.217 3.712 5.014 5.014 0 0 1-2.771 3.117l.144 1.446c.005.05.03.12.114.204.086.087.217.17.373.227.283.103.618.274.89.568.285.31.467.723.467 1.226v.75h1.25a.75.75 0 0 1 0 1.5H2.75a.75.75 0 0 1 0-1.5H4v-.75c0-.503.182-.916.468-1.226.27-.294.606-.465.889-.568.139-.048.266-.126.373-.227.084-.085.109-.153.114-.204l.144-1.446a5.015 5.015 0 0 1-2.77-3.117ZM4.5 1.568V5.5a3.5 3.5 0 1 0 7 0V1.568a.068.068 0 0 0-.068-.068H4.568a.068.068 0 0 0-.068.068Zm2.957 8.902-.12 1.204c-.093.925-.858 1.47-1.467 1.691a.766.766 0 0 0-.3.176c-.037.04-.07.093-.07.21v.75h5v-.75c0-.117-.033-.17-.07-.21a.766.766 0 0 0-.3-.176c-.609-.221-1.374-.766-1.466-1.69l-.12-1.204a5.064 5.064 0 0 1-1.087 0ZM13 2.5v2.872a2.25 2.25 0 0 0 1.5-2.122v-.5a.25.25 0 0 0-.25-.25H13Zm-10 0H1.75a.25.25 0 0 0-.25.25v.5c0 .98.626 1.813 1.5 2.122Z"],
};

const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const icon = (name, x, y, color, size = 16) =>
  `<svg x="${x}" y="${y}" width="${size}" height="${size}" viewBox="0 0 16 16">` +
  ICONS[name].map((d) => `<path fill="${color}" d="${d}"/>`).join("") + "</svg>";

// language dots: colors like Prisma's #0c344b vanish on the dark card, so ring them
const lum = (hex) => {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const dot = (C, cx, cy, r, color) =>
  `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${color}"${C === THEMES.dark && lum(color) < 0.2 ? ` stroke="${C.faint}" stroke-width="1"` : ""}/>`;

function card(C, w, h, { title, glyph, note = "" }, body) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}">
  <rect x="${IN + 0.5}" y="0.5" width="${w - 2 * IN - 1}" height="${h - 1}" rx="6" fill="${C.bg}" stroke="${C.border}"/>
  ${glyph ? icon(glyph, PAD, 30, C.accent, 18) : ""}
  <text x="${glyph ? PAD + 28 : PAD}" y="45" font-size="19" font-weight="600" fill="${C.accent}" font-family="${SANS}">${esc(title)}</text>
  ${note ? `<text x="${w - PAD}" y="44" font-size="12" fill="${C.faint}" font-family="${MONO}" text-anchor="end">${esc(note)}</text>` : ""}
  ${body}\n</svg>\n`;
}

// thin segmented bar in GitHub's language-bar style
function langBar(langs, x0, y, w, h, id) {
  const sum = langs.reduce((a, l) => a + l.pct, 0) || 1;
  let x = x0;
  const segs = langs
    .map((l, i) => {
      const last = i === langs.length - 1;
      const full = last ? x0 + w - x : Math.max(2, (l.pct / sum) * w);
      const r = `<rect x="${x.toFixed(1)}" y="${y}" width="${Math.max(1, full - (last ? 0 : 2)).toFixed(1)}" height="${h}" fill="${l.color}"/>`;
      x += full;
      return r;
    })
    .join("");
  return `<clipPath id="${id}"><rect x="${x0}" y="${y}" width="${w}" height="${h}" rx="${h / 2}"/></clipPath><g clip-path="url(#${id})">${segs}</g>`;
}

async function gql(query) {
  const r = await fetch("https://api.github.com/graphql", {
    method: "POST",
    headers: { Authorization: "bearer " + token, "Content-Type": "application/json" },
    body: JSON.stringify({ query }),
  });
  return (await r.json()).data;
}

let readme = readFileSync("README.md", "utf8");

/* 1) latest posts */
if (!ONLY_LANGUAGES) {
  const xml = await (await fetch("https://seok05.github.io/feed.xml")).text();
  const unesc = (s) => s.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"');
  const items = [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)].slice(0, 5).map(([, it]) => {
    const pick = (tag) => (it.match(new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`)) || [])[1] || "";
    const d = new Date(new Date(pick("pubDate")).getTime() + 9 * 3600 * 1000);
    return { title: unesc(pick("title")), link: pick("link"), date: d.toISOString().slice(0, 10) };
  });
  const mdEscape = (s) => s.replace(/([\[\]])/g, "\\$1");
  const list = items.map((p) => `- \`${p.date}\` [${mdEscape(p.title)}](${p.link})`).join("\n");
  readme = readme.replace(/<!-- BLOG:START -->[\s\S]*?<!-- BLOG:END -->/, `<!-- BLOG:START -->\n${list}\n<!-- BLOG:END -->`);
  console.log(`posts: ${items.length}`);
}

/* 2a) project cards (no token needed) */
const langData = existsSync("assets/languages.json") ? JSON.parse(readFileSync("assets/languages.json", "utf8")) : null;
if (existsSync("assets/projects.json")) {
  const { projects } = JSON.parse(readFileSync("assets/projects.json", "utf8"));
  const W = 452, H = 206, R = W - PAD;
  for (const p of projects) {
    const langs = (p.repo && langData?.perRepo?.[p.repo]) || [];
    for (const [suffix, C] of Object.entries(THEMES)) {
      const pillW = 16 + p.badge.length * 7;
      const head =
        icon(p.icon || "repo", PAD, 31, C.muted) +
        `<text x="${PAD + 24}" y="45" font-size="17" font-weight="600" fill="${C.accent}" font-family="${SANS}">${esc(p.name)}</text>` +
        `<rect x="${R - pillW + 0.5}" y="29.5" width="${pillW - 1}" height="21" rx="10.5" fill="none" stroke="${C.border}"/>` +
        `<text x="${R - pillW / 2}" y="44" font-size="12" font-weight="500" fill="${C.muted}" font-family="${SANS}" text-anchor="middle">${esc(p.badge)}</text>`;
      const desc = p.description
        .map((line, i) => `<text x="${PAD}" y="${80 + i * 20}" font-size="13.5" fill="${C.muted}" font-family="${SANS}">${esc(line)}</text>`)
        .join("");
      let tx = PAD;
      const topics = p.topics
        .map((t) => {
          const w = 18 + t.length * 6.9;
          const s =
            `<rect x="${tx.toFixed(1)}" y="118" width="${w.toFixed(1)}" height="22" rx="11" fill="${C.topic}"/>` +
            `<text x="${(tx + w / 2).toFixed(1)}" y="133" font-size="12" font-weight="500" fill="${C.accent}" font-family="${SANS}" text-anchor="middle">${esc(t)}</text>`;
          tx += w + 6;
          return s;
        })
        .join("");
      let bottom = "";
      if (langs.length) {
        let lx = PAD;
        for (const l of langs) {
          const pct = `${l.pct.toFixed(1)}%`;
          const w = 15 + l.name.length * 7.1 + 5 + pct.length * 7.2;
          if (lx + w > R) break;
          bottom +=
            dot(C, (lx + 5).toFixed(1), 166, 5, l.color) +
            `<text x="${(lx + 15).toFixed(1)}" y="170.5" font-size="12.5" fill="${C.ink}" font-family="${SANS}">${esc(l.name)}` +
            `<tspan dx="5" font-size="12" fill="${C.muted}" font-family="${MONO}">${pct}</tspan></text>`;
          lx += w + 18;
        }
        bottom += langBar(langs, PAD, 184, R - PAD, 6, `pb-${p.key}`);
      } else if (p.note) {
        bottom = `<text x="${PAD}" y="170.5" font-size="12.5" fill="${C.muted}" font-family="${SANS}">${esc(p.note)}</text>`;
      }
      writeFileSync(
        `assets/project-${p.key}-${suffix}.svg`,
        `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}">
  <rect x="${IN + 0.5}" y="0.5" width="${W - 2 * IN - 1}" height="${H - 1}" rx="6" fill="${C.bg}" stroke="${C.border}"/>
  ${head}${desc}${topics}${bottom}\n</svg>\n`
      );
    }
  }
  // README block: two cards per row, each linking to its write-ups
  const pic = (p) =>
    `<a href="${p.link}"><picture><source media="(prefers-color-scheme: dark)" srcset="assets/project-${p.key}-dark.svg"><img alt="${esc(p.name)}: ${esc(p.description.join(" "))}" src="assets/project-${p.key}-light.svg" width="50%"></picture></a>`;
  const rows = [];
  for (let i = 0; i < projects.length; i += 2) rows.push(`<p>${projects.slice(i, i + 2).map(pic).join("")}</p>`);
  readme = readme.replace(/<!-- PROJECTS:START -->[\s\S]*?<!-- PROJECTS:END -->/, `<!-- PROJECTS:START -->\n${rows.join("\n")}\n<!-- PROJECTS:END -->`);
  console.log(`project cards: ${projects.map((p) => p.key).join(", ")}`);
}

/* 2b) languages card (no token needed) */
if (langData) {
  const W = 904, H = 188, barX = PAD, barW = W - 2 * PAD;
  for (const [suffix, C] of Object.entries(THEMES)) {
    // up to eight named slots; only fold the tail into "Other" when there are more
    const fits = langData.languages.length <= 8;
    const shown = fits ? langData.languages.slice() : langData.languages.slice(0, 7);
    const restPct = fits ? 0 : langData.languages.slice(7).reduce((a, l) => a + l.pct, 0);
    if (restPct > 0) shown.push({ name: "Other", pct: Math.round(restPct * 10) / 10, color: C.faint });
    const colW = barW / 4;
    const legend = shown
      .map((l, i) => {
        const cx = barX + (i % 4) * colW;
        const y = 118 + Math.floor(i / 4) * 30;
        return (
          dot(C, (cx + 6).toFixed(1), y - 5, 6, l.color) +
          `<text x="${(cx + 20).toFixed(1)}" y="${y}" font-size="14.5" font-weight="600" fill="${C.ink}" font-family="${SANS}">${esc(l.name)}` +
          `<tspan dx="8" font-size="13.5" font-weight="400" fill="${C.muted}" font-family="${MONO}">${l.pct.toFixed(1)}%</tspan></text>`
        );
      })
      .join("");
    writeFileSync(
      `assets/langs-${suffix}.svg`,
      card(C, W, H, { title: "Most used languages", glyph: "code", note: `as of ${langData.asOf}` }, langBar(shown, barX, 66, barW, 12, "bar") + legend)
    );
  }
  console.log(`languages card: ${langData.languages.slice(0, 3).map((l) => l.name).join(", ")}`);
}

/* 2c) activity cards (need the token) */
if (!ONLY_LANGUAGES && token) {
  const d1 = await gql(`query{user(login:"${LOGIN}"){id
    contributionsCollection{totalCommitContributions restrictedContributionsCount
      contributionCalendar{totalContributions weeks{contributionDays{date weekday contributionCount}}}}
    pullRequests{totalCount} issues{totalCount}
    repositoriesContributedTo(contributionTypes:[COMMIT,PULL_REQUEST,ISSUE,REPOSITORY]){totalCount}
    repositories(first:50,ownerAffiliations:OWNER,privacy:PUBLIC){nodes{stargazerCount name}}}}`);
  const u = d1.user;
  const stats = {
    stars: u.repositories.nodes.reduce((a, r) => a + r.stargazerCount, 0),
    commits: u.contributionsCollection.totalCommitContributions + u.contributionsCollection.restrictedContributionsCount,
    prs: u.pullRequests.totalCount,
    issues: u.issues.totalCount,
    contributedTo: u.repositoriesContributedTo.totalCount,
  };
  const repoQ = u.repositories.nodes
    .map((r, i) => `r${i}: repository(owner:"${LOGIN}",name:"${r.name}"){defaultBranchRef{target{... on Commit{history(first:100,author:{id:"${u.id}"}){nodes{committedDate}}}}}}`)
    .join("\n");
  const d2 = await gql(`query{${repoQ}}`);
  const buckets = [0, 0, 0, 0]; // morning, daytime, evening, night
  for (const k of Object.keys(d2 || {})) {
    for (const n of d2[k]?.defaultBranchRef?.target?.history?.nodes || []) {
      const h = parseInt(n.committedDate.slice(11, 13), 10);
      if (h >= 6 && h < 12) buckets[0]++;
      else if (h >= 12 && h < 18) buckets[1]++;
      else if (h >= 18) buckets[2]++;
      else buckets[3]++;
    }
  }

  /* commits by time of day */
  const LABELS = ["Morning", "Daytime", "Evening", "Night"];
  const TITLES = ["I'm an early bird", "I code in daylight", "I'm an evening coder", "I'm a night owl"];
  const total = buckets.reduce((a, b) => a + b, 0) || 1;
  const top = buckets.indexOf(Math.max(...buckets));
  const W2 = 452, H2 = 236, R2 = W2 - PAD;
  for (const [suffix, C] of Object.entries(THEMES)) {
    const rows = LABELS.map((label, i) => {
      const n = buckets[i];
      const w = Math.max(3, Math.round((n / Math.max(...buckets)) * 126));
      const y = 90 + i * 34;
      const on = i === top;
      return (
        `<text x="${PAD}" y="${y}" font-size="14.5" font-family="${MONO}" fill="${on ? C.ink : C.muted}" font-weight="${on ? 600 : 400}">${label}</text>` +
        `<text x="${PAD + 172}" y="${y}" font-size="13.5" font-family="${MONO}" fill="${C.muted}" text-anchor="end">${n} commits</text>` +
        `<rect x="${PAD + 184}" y="${y - 12}" width="126" height="13" rx="3" fill="${C.track}"/>` +
        `<rect x="${PAD + 184}" y="${y - 12}" width="${w}" height="13" rx="3" fill="${on ? C.accent : C.faint}"/>` +
        `<text x="${R2}" y="${y}" font-size="13.5" font-family="${MONO}" fill="${on ? C.ink : C.faint}" text-anchor="end" font-weight="${on ? 600 : 400}">${((n / total) * 100).toFixed(1)}%</text>`
      );
    }).join("");
    const foot = `<text x="${PAD}" y="${H2 - 18}" font-size="11" fill="${C.faint}" font-family="${SANS}">public repos · author-local commit time</text>`;
    writeFileSync(`assets/pin-time-${suffix}.svg`, card(C, W2, H2, { title: TITLES[top], glyph: top < 2 ? "sun" : "moon" }, rows + foot));

    /* GitHub stats */
    const S2 = [
      ["star", "Total stars", stats.stars],
      ["git-commit", "Commits (past year)", stats.commits],
      ["git-pull-request", "Pull requests", stats.prs],
      ["issue-opened", "Issues", stats.issues],
      ["repo", "Contributed to", stats.contributedTo],
    ];
    const rows2 = S2.map(([g, label, n], i) => {
      const y = 88 + i * 31;
      return (
        icon(g, PAD, y - 13, C.muted) +
        `<text x="${PAD + 26}" y="${y}" font-size="14.5" font-family="${MONO}" fill="${C.muted}">${label}</text>` +
        `<line x1="${PAD + 216}" y1="${y - 5}" x2="${R2 - 44}" y2="${y - 5}" stroke="${C.track}" stroke-width="1.5"/>` +
        `<text x="${R2}" y="${y}" font-size="16" font-family="${MONO}" fill="${C.ink}" font-weight="700" text-anchor="end">${n.toLocaleString("en-US")}</text>`
      );
    }).join("");
    writeFileSync(`assets/pin-stats-${suffix}.svg`, card(C, W2, H2, { title: `${LOGIN}'s GitHub Stats`, glyph: "mark-github" }, rows2));
  }
  console.log(`time + stats cards: ${buckets.join("/")}, commits ${stats.commits}`);

  /* contribution skyline: recent weeks as isometric bars, plus streaks.
     The profile page already shows the full-year calendar, so this zooms in
     on the part with activity instead of repeating it. */
  const cal = u.contributionsCollection.contributionCalendar;
  const allDays = cal.weeks.flatMap((w) => w.contributionDays);
  const counts = allDays.map((d) => d.contributionCount);
  let longest = 0;
  for (let i = 0, run = 0; i < counts.length; i++) {
    run = counts[i] > 0 ? run + 1 : 0;
    longest = Math.max(longest, run);
  }
  let k = counts.length - 1;
  if (counts[k] === 0) k--; // today may still be empty
  let current = 0;
  while (k >= 0 && counts[k] > 0) {
    current++;
    k--;
  }
  const best = allDays.reduce((a, d) => (d.contributionCount > a.contributionCount ? d : a), allDays[0]);
  const activeDays = counts.filter((c) => c > 0).length;
  const firstActive = counts.findIndex((c) => c > 0);
  const spanWeeks = firstActive < 0 ? 0 : Math.ceil((counts.length - firstActive) / 7);
  const N = Math.max(10, Math.min(20, spanWeeks + 3));
  const weeks = cal.weeks.slice(-N);
  const maxCount = Math.max(1, ...weeks.flatMap((w) => w.contributionDays.map((d) => d.contributionCount)));
  const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const fmtDay = (iso) => `${MON[parseInt(iso.slice(5, 7), 10) - 1]} ${parseInt(iso.slice(8, 10), 10)}`;
  const plural = (n, w) => `${n} ${w}${n === 1 ? "" : "s"}`;
  const LEVELS = {
    light: ["#ebedf0", "#9be9a8", "#40c463", "#30a14e", "#216e39"],
    dark: ["#161b22", "#0e4429", "#006d32", "#26a641", "#39d353"],
  };
  const shade = (hex, f) =>
    "#" + [1, 3, 5].map((i) => Math.round(parseInt(hex.slice(i, i + 2), 16) * (1 - f)).toString(16).padStart(2, "0")).join("");
  const W3 = 904, H3 = 372;
  const box = { x: PAD, y: 62, w: 530, h: H3 - 62 - 20 };
  const HMAX = 64, C30 = Math.cos(Math.PI / 6);
  const cs = Math.min(box.w / ((N + 7) * C30), (box.h - HMAX) / ((N + 7) * 0.5));
  const ox = box.x + box.w / 2 - ((N - 7) / 2) * C30 * cs;
  const oy = box.y + HMAX + (box.h - HMAX - (N + 7) * 0.5 * cs) / 2;
  const at = (w, d) => [ox + (w - d) * C30 * cs, oy + (w + d) * 0.5 * cs];
  const SX = 612, R3 = W3 - PAD;
  for (const [suffix, C] of Object.entries(THEMES)) {
    const poly = (pts, fill) =>
      `<polygon points="${pts.map((q) => q.map((v) => v.toFixed(1)).join(",")).join(" ")}" fill="${fill}" stroke="${C.bg}" stroke-width="0.8" stroke-linejoin="round"/>`;
    const cells = [];
    weeks.forEach((wk, w) => wk.contributionDays.forEach((day) => cells.push({ w, d: day.weekday, n: day.contributionCount })));
    cells.sort((a, b) => a.w + a.d - (b.w + b.d)); // back to front
    const bars = cells
      .map(({ w, d, n }) => {
        const col = LEVELS[suffix][n === 0 ? 0 : Math.min(4, Math.ceil((n / maxCount) * 4))];
        const h = n === 0 ? 3 : 8 + (n / maxCount) * (HMAX - 8);
        const P0 = at(w, d), P1 = at(w + 1, d), P2 = at(w + 1, d + 1), P3 = at(w, d + 1);
        const up = (q) => [q[0], q[1] - h];
        return poly([P3, P2, up(P2), up(P3)], shade(col, 0.1)) + poly([P2, P1, up(P1), up(P2)], shade(col, 0.22)) + poly([up(P0), up(P1), up(P2), up(P3)], col);
      })
      .join("");
    // label the first week of each month; drop the window's opening label when
    // the next month starts right after it, or the two collide
    const starts = [];
    weeks.forEach((wk, w) => {
      const m = parseInt(wk.contributionDays[0].date.slice(5, 7), 10) - 1;
      if (!starts.length || starts[starts.length - 1].m !== m) starts.push({ w, m });
    });
    if (starts.length > 1 && starts[1].w - starts[0].w < 3) starts.shift();
    const months = starts
      .map(({ w, m }) => {
        const [x, y] = at(w + 0.5, 7);
        return `<text x="${(x - 6).toFixed(1)}" y="${(y + 18).toFixed(1)}" font-size="12" fill="${C.faint}" font-family="${MONO}" text-anchor="end">${MON[m]}</text>`;
      })
      .join("");
    const big =
      `<text x="${SX}" y="136" font-size="46" font-weight="700" fill="${C.ink}" font-family="${MONO}" letter-spacing="-1">${cal.totalContributions}</text>` +
      `<text x="${SX}" y="164" font-size="13.5" fill="${C.muted}" font-family="${SANS}">contributions in the last year</text>`;
    const facts = [
      ["flame", "Current streak", plural(current, "day")],
      ["trophy", "Longest streak", plural(longest, "day")],
      ["calendar", "Busiest day", best.contributionCount ? `${fmtDay(best.date)} · ${best.contributionCount}` : "none yet"],
      ["pulse", "Active days", String(activeDays)],
    ]
      .map(([g, label, v], i) => {
        const y = 212 + i * 32;
        return (
          icon(g, SX, y - 13, C.muted) +
          `<text x="${SX + 24}" y="${y}" font-size="14" font-family="${MONO}" fill="${C.muted}">${label}</text>` +
          `<text x="${R3}" y="${y}" font-size="15" font-family="${MONO}" fill="${C.ink}" font-weight="700" text-anchor="end">${v}</text>`
        );
      })
      .join("");
    writeFileSync(
      `assets/skyline-${suffix}.svg`,
      card(C, W3, H3, { title: "Contribution skyline", glyph: "graph", note: `last ${N} weeks` }, bars + months + big + facts)
    );
  }
  console.log(`skyline: ${N} weeks, streak ${current} (longest ${longest}), busiest ${best.date} = ${best.contributionCount}`);
} else if (!ONLY_LANGUAGES) {
  console.log("activity cards: no token, skipped");
}

/* 3) cache-bust every card the README points at */
readme = readme.replace(/(assets\/[\w.-]+\.svg)(\?v=\w+)?/g, (m, path) =>
  existsSync(path) ? `${path}?v=${createHash("sha1").update(readFileSync(path)).digest("hex").slice(0, 8)}` : m
);
writeFileSync("README.md", readme);
