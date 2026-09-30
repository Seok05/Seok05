/* 매일 아침 한 번:
   1) 블로그 RSS에서 최근 글 5편 → README의 BLOG 구간
   2) GitHub GraphQL(기여 수)·RSS(글 수)로 통계 카드 SVG(라이트/다크) 생성 */
import { readFileSync, writeFileSync } from "node:fs";

const FEED = "https://seok05.github.io/feed.xml";
const xml = await (await fetch(FEED)).text();

const unesc = (s) =>
  s.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"');
const allItems = [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)].map(([, it]) => {
  const pick = (tag) => (it.match(new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`)) || [])[1] || "";
  const d = new Date(pick("pubDate"));
  const kst = new Date(d.getTime() + 9 * 3600 * 1000);
  const date = `${kst.getUTCFullYear()}.${String(kst.getUTCMonth() + 1).padStart(2, "0")}.${String(kst.getUTCDate()).padStart(2, "0")}`;
  return { title: unesc(pick("title")), link: pick("link"), date, cat: unesc(pick("category")) };
});

/* 1) 최근 글 */
const mdEscape = (s) => s.replace(/([\[\]])/g, "\\$1");
const list = allItems
  .slice(0, 5)
  .map((p) => `- **[${mdEscape(p.title)}](${p.link})** <sub>${p.date} · ${p.cat}</sub>`)
  .join("\n");
const readme = readFileSync("README.md", "utf8");
writeFileSync(
  "README.md",
  readme.replace(/<!-- BLOG:START -->[\s\S]*?<!-- BLOG:END -->/, `<!-- BLOG:START -->\n${list}\n<!-- BLOG:END -->`)
);
console.log(`최근 글 ${Math.min(5, allItems.length)}편 반영`);

/* 2) 통계 카드 */
const token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN || "";
let contrib = null;
if (token) {
  try {
    const r = await fetch("https://api.github.com/graphql", {
      method: "POST",
      headers: { Authorization: "bearer " + token, "Content-Type": "application/json" },
      body: JSON.stringify({
        query:
          'query{user(login:"Seok05"){contributionsCollection{contributionCalendar{totalContributions}}}}',
      }),
    });
    const j = await r.json();
    contrib = j?.data?.user?.contributionsCollection?.contributionCalendar?.totalContributions ?? null;
  } catch (e) {}
}

const THEMES = {
  "stats-light": { bg: "#f6f4ee", card: "#fffdf8", ink: "#1d1a13", muted: "#6f695c", faint: "#9d9787", rule: "#e7e2d4", accent: "#4f46e5" },
  "stats-dark": { bg: "#0c0e12", card: "#13161c", ink: "#e8e9ec", muted: "#939aa7", faint: "#697180", rule: "#21252d", accent: "#a19bff" },
};

const stats = [
  contrib !== null ? [String(contrib), "지난 1년 기여"] : null,
  [String(allItems.length), "블로그 글"],
  [allItems[0] ? allItems[0].date.slice(5) : "—", "마지막 기록"],
].filter(Boolean);

for (const [name, C] of Object.entries(THEMES)) {
  const cols = stats
    .map(
      ([num, label], i) =>
        `<g transform="translate(${36 + i * 150},0)">` +
        `<text x="0" y="64" font-size="30" font-weight="700" fill="${C.ink}" font-family="'SF Mono',Menlo,Consolas,monospace" letter-spacing="-1">${num}</text>` +
        `<text x="1" y="88" font-size="12.5" fill="${C.muted}" font-family="'Apple SD Gothic Neo','Malgun Gothic',sans-serif">${label}</text></g>`
    )
    .join("");
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 520 124">
  <defs><pattern id="d" width="20" height="20" patternUnits="userSpaceOnUse"><circle cx="1.4" cy="1.4" r="1" fill="${C.ink}" opacity="0.08"/></pattern></defs>
  <rect width="520" height="124" rx="16" fill="${C.bg}"/>
  <rect width="520" height="124" rx="16" fill="url(#d)"/>
  <rect x="0.5" y="0.5" width="519" height="123" rx="16" fill="none" stroke="${C.rule}"/>
  <text x="36" y="34" font-size="11" letter-spacing="3" fill="${C.faint}" font-family="'SF Mono',Menlo,monospace">SEOK LAB · LOGBOOK</text>
  ${cols}
  <g transform="translate(452,44)">
    <circle cx="0" cy="18" r="13" fill="${C.accent}"/>
    <circle cx="-4" cy="15" r="1.9" fill="${C.bg}"/><circle cx="4.5" cy="15" r="1.9" fill="${C.bg}"/>
    <path d="M-4 21 q4 3.4 8.5 0" fill="none" stroke="${C.bg}" stroke-width="1.8" stroke-linecap="round"/>
    <circle cx="-30" cy="18" r="10" fill="none" stroke="${C.faint}" stroke-width="2.4" stroke-dasharray="3.5 4.5"/>
  </g>
</svg>\n`;
  writeFileSync(`assets/${name}.svg`, svg);
}
console.log(`통계 카드 갱신 (기여: ${contrib ?? "토큰 없음, 생략"})`);
