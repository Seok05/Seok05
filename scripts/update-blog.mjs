/* 블로그 RSS(feed.xml)에서 최근 글 5편을 읽어 README의 BLOG 구간을 갱신한다. */
import { readFileSync, writeFileSync } from "node:fs";

const FEED = "https://seok05.github.io/feed.xml";
const xml = await (await fetch(FEED)).text();

const items = [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)].slice(0, 5).map(([, it]) => {
  const pick = (tag) => (it.match(new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`)) || [])[1] || "";
  const unesc = (s) =>
    s.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"');
  const d = new Date(pick("pubDate"));
  const kst = new Date(d.getTime() + 9 * 3600 * 1000);
  const date = `${kst.getUTCFullYear()}.${String(kst.getUTCMonth() + 1).padStart(2, "0")}.${String(kst.getUTCDate()).padStart(2, "0")}`;
  return { title: unesc(pick("title")), link: pick("link"), date, cat: unesc(pick("category")) };
});

const mdEscape = (s) => s.replace(/([\[\]])/g, "\\$1");
const list = items
  .map((p) => `- **[${mdEscape(p.title)}](${p.link})** <sub>${p.date} · ${p.cat}</sub>`)
  .join("\n");

const readme = readFileSync("README.md", "utf8");
const next = readme.replace(
  /<!-- BLOG:START -->[\s\S]*?<!-- BLOG:END -->/,
  `<!-- BLOG:START -->\n${list}\n<!-- BLOG:END -->`
);
writeFileSync("README.md", next);
console.log(`최근 글 ${items.length}편 반영`);
