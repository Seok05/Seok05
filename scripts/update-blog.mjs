/* Daily profile refresh:
   1) latest 5 blog posts from RSS -> README BLOG section
   2) two stat cards (commits by time of day, overall stats) drawn as SVG
      in GitHub's own palette, light + dark. GITHUB_TOKEN only. */
import { readFileSync, writeFileSync } from "node:fs";

const LOGIN = "Seok05";
const token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN || "";

const THEMES = {
  light: { bg: "#ffffff", border: "#d0d7de", ink: "#1f2328", muted: "#656d76", faint: "#8b949e", accent: "#0969da", track: "#eff2f5" },
  dark: { bg: "#0d1117", border: "#30363d", ink: "#e6edf3", muted: "#8d96a0", faint: "#6e7681", accent: "#58a6ff", track: "#21262d" },
};
const MONO = "'SFMono-Regular',Consolas,'Liberation Mono',Menlo,monospace";
const SANS = "-apple-system,BlinkMacSystemFont,'Segoe UI','Noto Sans',Helvetica,Arial,sans-serif";

async function gql(query) {
  const r = await fetch("https://api.github.com/graphql", {
    method: "POST",
    headers: { Authorization: "bearer " + token, "Content-Type": "application/json" },
    body: JSON.stringify({ query }),
  });
  return (await r.json()).data;
}

/* 1) blog list */
const xml = await (await fetch("https://seok05.github.io/feed.xml")).text();
const unesc = (s) => s.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"');
const items = [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)].slice(0, 5).map(([, it]) => {
  const pick = (tag) => (it.match(new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`)) || [])[1] || "";
  const d = new Date(pick("pubDate"));
  const kst = new Date(d.getTime() + 9 * 3600 * 1000);
  const date = `${kst.getUTCFullYear()}-${String(kst.getUTCMonth() + 1).padStart(2, "0")}-${String(kst.getUTCDate()).padStart(2, "0")}`;
  return { title: unesc(pick("title")), link: pick("link"), date };
});
const mdEscape = (s) => s.replace(/([\[\]])/g, "\\$1");
const list = items.map((p) => `- [${mdEscape(p.title)}](${p.link}) <sub>${p.date}</sub>`).join("\n");
const readme = readFileSync("README.md", "utf8");
writeFileSync("README.md", readme.replace(/<!-- BLOG:START -->[\s\S]*?<!-- BLOG:END -->/, `<!-- BLOG:START -->\n${list}\n<!-- BLOG:END -->`));
console.log(`blog: ${items.length} posts`);

/* card frame: plain GitHub box */
function card(C, w, h, title, body) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}">
  <rect x="0.5" y="0.5" width="${w - 1}" height="${h - 1}" rx="6" fill="${C.bg}" stroke="${C.border}"/>
  <text x="24" y="38" font-size="14" font-weight="600" fill="${C.accent}" font-family="${SANS}">${title}</text>
  ${body}\n</svg>\n`;
}

/* 2) stats */
if (!token) {
  console.log("cards: no token, skipped");
  process.exit(0);
}
const d1 = await gql(`query{user(login:"${LOGIN}"){id
  contributionsCollection{totalCommitContributions restrictedContributionsCount}
  pullRequests{totalCount} issues{totalCount}
  repositoriesContributedTo(contributionTypes:[COMMIT,PULL_REQUEST,ISSUE,REPOSITORY]){totalCount}
  repositories(first:50,ownerAffiliations:OWNER,privacy:PUBLIC){nodes{stargazerCount name}}}}`);
const u = d1?.user;
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
const buckets = [0, 0, 0, 0]; // morning day evening night
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

for (const [suffix, C] of Object.entries(THEMES)) {
  const rows = LABELS.map((label, i) => {
    const n = buckets[i];
    const pct = (Math.round((n / total) * 1000) / 10).toFixed(1);
    const w = Math.max(3, Math.round((n / Math.max(...buckets)) * 140));
    const y = 74 + i * 30;
    const on = i === top;
    return (
      `<text x="24" y="${y}" font-size="12" font-family="${MONO}" fill="${on ? C.ink : C.muted}" font-weight="${on ? 600 : 400}">${label}</text>` +
      `<text x="178" y="${y}" font-size="12" font-family="${MONO}" fill="${C.muted}" text-anchor="end">${n} commits</text>` +
      `<rect x="192" y="${y - 10}" width="140" height="10" rx="2" fill="${C.track}"/>` +
      `<rect x="192" y="${y - 10}" width="${w}" height="10" rx="2" fill="${on ? C.accent : C.faint}"/>` +
      `<text x="416" y="${y}" font-size="12" font-family="${MONO}" fill="${on ? C.ink : C.faint}" text-anchor="end" font-weight="${on ? 600 : 400}">${pct}%</text>`
    );
  }).join("");
  const note = `<text x="24" y="204" font-size="10" fill="${C.faint}" font-family="${SANS}">public repos · author-local commit time</text>`;
  writeFileSync(`assets/pin-time-${suffix}.svg`, card(C, 440, 220, TITLES[top], rows + note));

  const S2 = [
    ["Total Stars", stats.stars],
    ["Total Commits (past year)", stats.commits],
    ["Total PRs", stats.prs],
    ["Total Issues", stats.issues],
    ["Contributed to", stats.contributedTo],
  ];
  const rows2 = S2.map(([label, n], i) => {
    const y = 72 + i * 28;
    return (
      `<text x="24" y="${y}" font-size="12" font-family="${MONO}" fill="${C.muted}">${label}</text>` +
      `<line x1="220" y1="${y - 4}" x2="380" y2="${y - 4}" stroke="${C.track}"/>` +
      `<text x="416" y="${y}" font-size="12.5" font-family="${MONO}" fill="${C.ink}" font-weight="600" text-anchor="end">${n.toLocaleString("en-US")}</text>`
    );
  }).join("");
  writeFileSync(`assets/pin-stats-${suffix}.svg`, card(C, 440, 220, `${LOGIN}'s GitHub Stats`, rows2));
}
console.log(`cards: time ${buckets.join("/")}, commits ${stats.commits}, stars ${stats.stars}`);
