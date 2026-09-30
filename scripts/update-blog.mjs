/* 매일 아침 한 번:
   1) 블로그 RSS → README의 최근 글 5편
   2) 기록 장부 카드 (기여·글 수·마지막 기록)
   3) 책상 위 핀 두 장: 시간대별 커밋(공개 저장소) + 종합 스탯
   전부 GITHUB_TOKEN만으로 GraphQL을 읽어 SVG를 직접 그린다. */
import { readFileSync, writeFileSync } from "node:fs";

const LOGIN = "Seok05";
const token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN || "";

const THEMES = {
  light: { bg: "#f6f4ee", card: "#fffdf8", ink: "#1d1a13", muted: "#6f695c", faint: "#9d9787", rule: "#e7e2d4", accent: "#4f46e5", track: "#efebdf" },
  dark: { bg: "#0c0e12", card: "#13161c", ink: "#e8e9ec", muted: "#939aa7", faint: "#697180", rule: "#21252d", accent: "#a19bff", track: "#1a1e26" },
};
const MONO = "'SF Mono',Menlo,Consolas,monospace";
const SANS = "'Apple SD Gothic Neo','Malgun Gothic',sans-serif";

async function gql(query) {
  const r = await fetch("https://api.github.com/graphql", {
    method: "POST",
    headers: { Authorization: "bearer " + token, "Content-Type": "application/json" },
    body: JSON.stringify({ query }),
  });
  return (await r.json()).data;
}

/* ── 1) 블로그 ── */
const xml = await (await fetch("https://seok05.github.io/feed.xml")).text();
const unesc = (s) => s.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"');
const allItems = [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)].map(([, it]) => {
  const pick = (tag) => (it.match(new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`)) || [])[1] || "";
  const d = new Date(pick("pubDate"));
  const kst = new Date(d.getTime() + 9 * 3600 * 1000);
  const date = `${kst.getUTCFullYear()}.${String(kst.getUTCMonth() + 1).padStart(2, "0")}.${String(kst.getUTCDate()).padStart(2, "0")}`;
  return { title: unesc(pick("title")), link: pick("link"), date, cat: unesc(pick("category")) };
});
const mdEscape = (s) => s.replace(/([\[\]])/g, "\\$1");
const list = allItems.slice(0, 5).map((p) => `- **[${mdEscape(p.title)}](${p.link})** <sub>${p.date} · ${p.cat}</sub>`).join("\n");
const readme = readFileSync("README.md", "utf8");
writeFileSync("README.md", readme.replace(/<!-- BLOG:START -->[\s\S]*?<!-- BLOG:END -->/, `<!-- BLOG:START -->\n${list}\n<!-- BLOG:END -->`));
console.log(`최근 글 ${Math.min(5, allItems.length)}편`);

/* ── 공용 카드 틀 ── */
function card(C, w, h, eyebrow, body) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}">
  <defs><pattern id="d" width="20" height="20" patternUnits="userSpaceOnUse"><circle cx="1.4" cy="1.4" r="1" fill="${C.ink}" opacity="0.08"/></pattern></defs>
  <rect width="${w}" height="${h}" rx="16" fill="${C.bg}"/>
  <rect width="${w}" height="${h}" rx="16" fill="url(#d)"/>
  <rect x="0.5" y="0.5" width="${w - 1}" height="${h - 1}" rx="16" fill="none" stroke="${C.rule}"/>
  <text x="32" y="36" font-size="11" letter-spacing="3" fill="${C.faint}" font-family="${MONO}">${eyebrow}</text>
  ${body}\n</svg>\n`;
}

/* ── 2) 기록 장부 ── */
let contrib = null;
let stats = null;
let hourBuckets = null;
if (token) {
  const d1 = await gql(`query{user(login:"${LOGIN}"){id
    contributionsCollection{contributionCalendar{totalContributions} totalCommitContributions restrictedContributionsCount}
    pullRequests{totalCount} issues{totalCount}
    repositoriesContributedTo(contributionTypes:[COMMIT,PULL_REQUEST,ISSUE,REPOSITORY]){totalCount}
    repositories(first:50,ownerAffiliations:OWNER,privacy:PUBLIC){nodes{stargazerCount name}}}}`);
  const u = d1?.user;
  if (u) {
    contrib = u.contributionsCollection.contributionCalendar.totalContributions;
    stats = {
      stars: u.repositories.nodes.reduce((a, r) => a + r.stargazerCount, 0),
      commits: u.contributionsCollection.totalCommitContributions + u.contributionsCollection.restrictedContributionsCount,
      prs: u.pullRequests.totalCount,
      issues: u.issues.totalCount,
      contributedTo: u.repositoriesContributedTo.totalCount,
    };
    /* 공개 저장소 기본 브랜치에서 내 커밋 시각(작성자 시간대 기준) */
    const repoQ = u.repositories.nodes
      .map((r, i) => `r${i}: repository(owner:"${LOGIN}",name:"${r.name}"){defaultBranchRef{target{... on Commit{history(first:100,author:{id:"${u.id}"}){nodes{committedDate}}}}}}`)
      .join("\n");
    const d2 = await gql(`query{${repoQ}}`);
    hourBuckets = [0, 0, 0, 0]; // 아침 낮 저녁 밤
    for (const k of Object.keys(d2 || {})) {
      const nodes = d2[k]?.defaultBranchRef?.target?.history?.nodes || [];
      for (const n of nodes) {
        const h = parseInt(n.committedDate.slice(11, 13), 10); // 커밋에 박힌 현지 시각
        if (h >= 6 && h < 12) hourBuckets[0]++;
        else if (h >= 12 && h < 18) hourBuckets[1]++;
        else if (h >= 18) hourBuckets[2]++;
        else hourBuckets[3]++;
      }
    }
  }
}

const logStats = [
  contrib !== null ? [String(contrib), "지난 1년 기여"] : null,
  [String(allItems.length), "블로그 글"],
  [allItems[0] ? allItems[0].date.slice(5) : "—", "마지막 기록"],
].filter(Boolean);
for (const [suffix, C] of [["light", THEMES.light], ["dark", THEMES.dark]]) {
  const cols = logStats
    .map(([num, label], i) =>
      `<g transform="translate(${36 + i * 150},0)"><text x="0" y="64" font-size="30" font-weight="700" fill="${C.ink}" font-family="${MONO}" letter-spacing="-1">${num}</text><text x="1" y="88" font-size="12.5" fill="${C.muted}" font-family="${SANS}">${label}</text></g>`)
    .join("");
  const ion = `<g transform="translate(452,44)"><circle cx="0" cy="18" r="13" fill="${C.accent}"/><circle cx="-4" cy="15" r="1.9" fill="${C.bg}"/><circle cx="4.5" cy="15" r="1.9" fill="${C.bg}"/><path d="M-4 21 q4 3.4 8.5 0" fill="none" stroke="${C.bg}" stroke-width="1.8" stroke-linecap="round"/><circle cx="-30" cy="18" r="10" fill="none" stroke="${C.faint}" stroke-width="2.4" stroke-dasharray="3.5 4.5"/></g>`;
  writeFileSync(`assets/stats-${suffix}.svg`, card(C, 520, 124, "SEOK LAB · LOGBOOK", cols + ion));
}
console.log(`기록 장부 (기여: ${contrib ?? "토큰 없음"})`);

/* ── 3) 핀 카드 두 장 ── */
if (hourBuckets) {
  const B = [
    ["🌅", "아침", "6-12시"],
    ["☀️", "낮", "12-18시"],
    ["🌆", "저녁", "18-24시"],
    ["🌙", "밤", "0-6시"],
  ];
  const total = hourBuckets.reduce((a, b) => a + b, 0) || 1;
  const top = hourBuckets.indexOf(Math.max(...hourBuckets));
  const TITLES = ["아침형이네요", "낮에 달리는 편", "저녁형입니다", "야행성입니다 🦉"];
  for (const [suffix, C] of [["light", THEMES.light], ["dark", THEMES.dark]]) {
    const rows = B.map(([emo, label, span], i) => {
      const n = hourBuckets[i];
      const pct = Math.round((n / total) * 1000) / 10;
      const w = Math.max(3, Math.round((n / Math.max(...hourBuckets)) * 150));
      const y = 96 + i * 30;
      const on = i === top;
      return (
        `<text x="34" y="${y}" font-size="13" font-family="${MONO}" fill="${C.faint}">${i + 1}</text>` +
        `<text x="56" y="${y}" font-size="13" font-family="${SANS}">${emo}</text>` +
        `<text x="80" y="${y}" font-size="13" font-family="${SANS}" fill="${on ? C.ink : C.muted}" font-weight="${on ? 700 : 400}">${label}</text>` +
        `<text x="185" y="${y}" font-size="12.5" font-family="${MONO}" fill="${C.muted}" text-anchor="end">${n} commits</text>` +
        `<rect x="200" y="${y - 10}" width="150" height="10" rx="5" fill="${C.track}"/>` +
        `<rect x="200" y="${y - 10}" width="${w}" height="10" rx="5" fill="${on ? C.accent : C.faint}"/>` +
        `<text x="412" y="${y}" font-size="12.5" font-family="${MONO}" fill="${on ? C.ink : C.faint}" text-anchor="end" font-weight="${on ? 700 : 400}">${pct}%</text>`
      );
    }).join("");
    const title = `<text x="32" y="62" font-size="16.5" font-weight="700" fill="${C.ink}" font-family="${SANS}">커밋 시계를 보니, ${TITLES[top]}</text>`;
    const note = `<text x="32" y="212" font-size="10.5" fill="${C.faint}" font-family="${SANS}">공개 저장소 기본 브랜치 · 커밋에 적힌 현지 시각 기준</text>`;
    writeFileSync(`assets/pin-time-${suffix}.svg`, card(C, 440, 228, `${LOGIN.toUpperCase()} · COMMIT O'CLOCK`, title + rows + note));
  }

  const S2 = [
    ["⭐", "받은 별", stats.stars],
    ["➕", "커밋 (지난 1년)", stats.commits],
    ["🔀", "풀 리퀘스트", stats.prs],
    ["🚩", "이슈", stats.issues],
    ["📦", "기여한 저장소", stats.contributedTo],
  ];
  for (const [suffix, C] of [["light", THEMES.light], ["dark", THEMES.dark]]) {
    const rows = S2.map(([emo, label, n], i) => {
      const y = 78 + i * 28;
      return (
        `<text x="34" y="${y}" font-size="13" font-family="${MONO}" fill="${C.faint}">${i + 1}</text>` +
        `<text x="56" y="${y}" font-size="13" font-family="${SANS}">${emo}</text>` +
        `<text x="82" y="${y}" font-size="13" font-family="${SANS}" fill="${C.muted}">${label}</text>` +
        `<line x1="200" y1="${y - 4}" x2="368" y2="${y - 4}" stroke="${C.rule}" stroke-dasharray="1 4"/>` +
        `<text x="408" y="${y}" font-size="13.5" font-family="${MONO}" fill="${C.ink}" font-weight="700" text-anchor="end">${n.toLocaleString("en-US")}</text>`
      );
    }).join("");
    writeFileSync(`assets/pin-stats-${suffix}.svg`, card(C, 440, 228, `${LOGIN.toUpperCase()} · GITHUB STATS`, rows));
  }
  console.log(`핀 카드 (시간대: ${hourBuckets.join("/")}, 별 ${stats.stars} · 커밋 ${stats.commits})`);
} else {
  console.log("핀 카드: 토큰 없음, 생략");
}
