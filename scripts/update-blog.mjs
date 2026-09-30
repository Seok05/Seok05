/* Daily profile refresh, run by the GitHub Action with GITHUB_TOKEN only.
   1) latest blog posts from RSS -> README BLOG section
   2) cards drawn as SVG in GitHub's own palette, light + dark:
      - commits by time of day (public repos)
      - GitHub stats
      - contribution skyline (recent weeks in 3D, with streaks)
      - most used languages, rendered from assets/languages.json
        (the data comes from scripts/languages.mjs, run by hand)
   Layout: half cards are 452 wide and the full card is 904, both with a
   6px inset, so two half cards at 50% line up with one full card at 100%. */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

process.chdir(fileURLToPath(new URL("..", import.meta.url)));
const ONLY_LANGUAGES = process.argv.includes("--languages");

const LOGIN = "Seok05";
const token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN || "";

const THEMES = {
  light: { bg: "#ffffff", border: "#d0d7de", ink: "#1f2328", muted: "#656d76", faint: "#8b949e", accent: "#0969da", track: "#eff2f5" },
  dark: { bg: "#0d1117", border: "#30363d", ink: "#e6edf3", muted: "#8d96a0", faint: "#6e7681", accent: "#58a6ff", track: "#21262d" },
};
const MONO = "'SFMono-Regular',Consolas,'Liberation Mono',Menlo,monospace";
const SANS = "-apple-system,BlinkMacSystemFont,'Segoe UI','Noto Sans',Helvetica,Arial,sans-serif";
const IN = 6; // side inset inside each viewBox
const PAD = IN + 24; // content left edge

async function gql(query) {
  const r = await fetch("https://api.github.com/graphql", {
    method: "POST",
    headers: { Authorization: "bearer " + token, "Content-Type": "application/json" },
    body: JSON.stringify({ query }),
  });
  return (await r.json()).data;
}

function card(C, w, h, title, body, note = "") {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}">
  <rect x="${IN + 0.5}" y="0.5" width="${w - 2 * IN - 1}" height="${h - 1}" rx="6" fill="${C.bg}" stroke="${C.border}"/>
  <text x="${PAD}" y="44" font-size="19" font-weight="600" fill="${C.accent}" font-family="${SANS}">${title}</text>
  ${note ? `<text x="${w - PAD}" y="44" font-size="12" fill="${C.faint}" font-family="${MONO}" text-anchor="end">${note}</text>` : ""}
  ${body}\n</svg>\n`;
}

if (!ONLY_LANGUAGES) {
/* 1) latest posts */
  const xml = await (await fetch("https://seok05.github.io/feed.xml")).text();
  const unesc = (s) => s.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"');
  const items = [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)].slice(0, 5).map(([, it]) => {
    const pick = (tag) => (it.match(new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`)) || [])[1] || "";
    const d = new Date(new Date(pick("pubDate")).getTime() + 9 * 3600 * 1000);
    const date = d.toISOString().slice(0, 10);
    return { title: unesc(pick("title")), link: pick("link"), date };
  });
  const mdEscape = (s) => s.replace(/([\[\]])/g, "\\$1");
  const list = items.map((p) => `- \`${p.date}\` [${mdEscape(p.title)}](${p.link})`).join("\n");
  const readme = readFileSync("README.md", "utf8");
  writeFileSync("README.md", readme.replace(/<!-- BLOG:START -->[\s\S]*?<!-- BLOG:END -->/, `<!-- BLOG:START -->\n${list}\n<!-- BLOG:END -->`));
  console.log(`posts: ${items.length}`);
}

/* 2a) languages card (no token needed) */
if (existsSync("assets/languages.json")) {
  const data = JSON.parse(readFileSync("assets/languages.json", "utf8"));
  const W = 904, H = 188, barX = PAD, barW = W - 2 * PAD, barY = 66, barH = 12;
  for (const [suffix, C] of Object.entries(THEMES)) {
    // up to eight named slots; only fold the tail into "Other" when there are more
    const fits = data.languages.length <= 8;
    const shown = fits ? data.languages.slice() : data.languages.slice(0, 7);
    const restPct = fits ? 0 : data.languages.slice(7).reduce((a, l) => a + l.pct, 0);
    if (restPct > 0) shown.push({ name: "Other", pct: Math.round(restPct * 10) / 10, color: C.faint });
    const sum = shown.reduce((a, l) => a + l.pct, 0);
    let x = barX;
    const segs = shown
      .map((l, i) => {
        const full = i === shown.length - 1 ? barX + barW - x : Math.max(3, (l.pct / sum) * barW);
        const r = `<rect x="${x.toFixed(1)}" y="${barY}" width="${Math.max(1, full - (i < shown.length - 1 ? 2 : 0)).toFixed(1)}" height="${barH}" fill="${l.color}"/>`;
        x += full;
        return r;
      })
      .join("");
    const colW = barW / 4;
    const legend = shown
      .map((l, i) => {
        const cx = barX + (i % 4) * colW;
        const y = 118 + Math.floor(i / 4) * 30;
        return (
          `<circle cx="${(cx + 6).toFixed(1)}" cy="${y - 5}" r="6" fill="${l.color}"/>` +
          `<text x="${(cx + 20).toFixed(1)}" y="${y}" font-size="14.5" font-weight="600" fill="${C.ink}" font-family="${SANS}">${l.name}` +
          `<tspan dx="8" font-size="13.5" font-weight="400" fill="${C.muted}" font-family="${MONO}">${l.pct.toFixed(1)}%</tspan></text>`
        );
      })
      .join("");
    const body =
      `<clipPath id="bar"><rect x="${barX}" y="${barY}" width="${barW}" height="${barH}" rx="6"/></clipPath>` +
      `<g clip-path="url(#bar)">${segs}</g>` + legend;
    writeFileSync(`assets/langs-${suffix}.svg`, card(C, W, H, "Most used languages", body, `as of ${data.asOf}`));
  }
  console.log(`languages card: ${data.languages.map((l) => l.name).slice(0, 3).join(", ")}...`);
}

/* 2b) activity cards (need the token) */
if (ONLY_LANGUAGES) process.exit(0);
if (!token) {
  console.log("activity cards: no token, skipped");
  process.exit(0);
}
const d1 = await gql(`query{user(login:"${LOGIN}"){id
  contributionsCollection{totalCommitContributions restrictedContributionsCount}
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

const LABELS = ["Morning", "Daytime", "Evening", "Night"];
const TITLES = ["I'm an early bird", "I code in daylight", "I'm an evening coder", "I'm a night owl"];
const total = buckets.reduce((a, b) => a + b, 0) || 1;
const top = buckets.indexOf(Math.max(...buckets));
const W2 = 452, H2 = 236, R = W2 - PAD;

for (const [suffix, C] of Object.entries(THEMES)) {
  const rows = LABELS.map((label, i) => {
    const n = buckets[i];
    const pct = ((n / total) * 100).toFixed(1);
    const w = Math.max(3, Math.round((n / Math.max(...buckets)) * 130));
    const y = 90 + i * 34;
    const on = i === top;
    return (
      `<text x="${PAD}" y="${y}" font-size="14.5" font-family="${MONO}" fill="${on ? C.ink : C.muted}" font-weight="${on ? 600 : 400}">${label}</text>` +
      `<text x="${PAD + 174}" y="${y}" font-size="13.5" font-family="${MONO}" fill="${C.muted}" text-anchor="end">${n} commits</text>` +
      `<rect x="${PAD + 186}" y="${y - 12}" width="130" height="13" rx="3" fill="${C.track}"/>` +
      `<rect x="${PAD + 186}" y="${y - 12}" width="${w}" height="13" rx="3" fill="${on ? C.accent : C.faint}"/>` +
      `<text x="${R}" y="${y}" font-size="13.5" font-family="${MONO}" fill="${on ? C.ink : C.faint}" text-anchor="end" font-weight="${on ? 600 : 400}">${pct}%</text>`
    );
  }).join("");
  const foot = `<text x="${PAD}" y="${H2 - 18}" font-size="11" fill="${C.faint}" font-family="${SANS}">public repos · author-local commit time</text>`;
  writeFileSync(`assets/pin-time-${suffix}.svg`, card(C, W2, H2, TITLES[top], rows + foot));

  const S2 = [
    ["Total Stars", stats.stars],
    ["Total Commits (past year)", stats.commits],
    ["Total PRs", stats.prs],
    ["Total Issues", stats.issues],
    ["Contributed to", stats.contributedTo],
  ];
  const rows2 = S2.map(([label, n], i) => {
    const y = 88 + i * 31;
    return (
      `<text x="${PAD}" y="${y}" font-size="14.5" font-family="${MONO}" fill="${C.muted}">${label}</text>` +
      `<line x1="${PAD + 232}" y1="${y - 5}" x2="${R - 40}" y2="${y - 5}" stroke="${C.track}" stroke-width="1.5"/>` +
      `<text x="${R}" y="${y}" font-size="16" font-family="${MONO}" fill="${C.ink}" font-weight="700" text-anchor="end">${n.toLocaleString("en-US")}</text>`
    );
  }).join("");
  writeFileSync(`assets/pin-stats-${suffix}.svg`, card(C, W2, H2, `${LOGIN}'s GitHub Stats`, rows2));
}
console.log(`activity cards: time ${buckets.join("/")}, commits ${stats.commits}`);

/* 2c) contribution skyline: recent weeks as isometric bars, plus streaks.
   The profile page already shows the full-year calendar, so this zooms in
   on the part with activity instead of repeating it. */
const cal = (
  await gql(`query{user(login:"${LOGIN}"){contributionsCollection{contributionCalendar{totalContributions weeks{contributionDays{date weekday contributionCount}}}}}}`)
).user.contributionsCollection.contributionCalendar;
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

// GitHub's own contribution greens
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
const at = (w, d, h = 0) => [ox + (w - d) * C30 * cs, oy + (w + d) * 0.5 * cs - h];
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
    ["Current streak", plural(current, "day")],
    ["Longest streak", plural(longest, "day")],
    ["Busiest day", best.contributionCount ? `${fmtDay(best.date)} · ${best.contributionCount}` : "none yet"],
    ["Active days", String(activeDays)],
  ]
    .map(([label, v], i) => {
      const y = 212 + i * 32;
      return (
        `<text x="${SX}" y="${y}" font-size="14" font-family="${MONO}" fill="${C.muted}">${label}</text>` +
        `<text x="${R3}" y="${y}" font-size="15" font-family="${MONO}" fill="${C.ink}" font-weight="700" text-anchor="end">${v}</text>`
      );
    })
    .join("");
  writeFileSync(`assets/skyline-${suffix}.svg`, card(C, W3, H3, "Contribution skyline", bars + months + big + facts, `last ${N} weeks`));
}
console.log(`skyline: ${N} weeks, streak ${current} (longest ${longest}), busiest ${best.date} = ${best.contributionCount}`);

