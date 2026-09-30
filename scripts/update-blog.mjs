/* Daily profile refresh, run by the GitHub Action with GITHUB_TOKEN only.
   1) latest blog posts from RSS -> README BLOG section
   2) cards drawn as SVG in GitHub's own palette, light + dark:
      - commits by time of day (public repos)
      - GitHub stats
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
