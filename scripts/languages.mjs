/* Scans local clones of my repositories, public and private, and writes
   assets/languages.json (bytes of source per language). The daily Action
   cannot read private repos, so this one is run by hand:

     node scripts/languages.mjs ~/Desktop/EValue ~/Desktop/첫잔/cheotjan ~/Desktop/seok05.github.io .

   Build output, dependencies, lockfiles, SQL seed data and the blog's post
   content are left out, so the totals reflect code rather than artifacts. */
import { execFileSync } from "node:child_process";
import { existsSync, statSync, writeFileSync } from "node:fs";
import { basename, extname, join } from "node:path";

const LANG = {
  ".ts": "TypeScript", ".tsx": "TypeScript",
  ".js": "JavaScript", ".jsx": "JavaScript", ".mjs": "JavaScript", ".cjs": "JavaScript",
  ".py": "Python", ".sql": "SQL", ".sh": "Shell", ".bash": "Shell",
  ".css": "CSS", ".scss": "CSS", ".html": "HTML", ".prisma": "Prisma",
  ".kt": "Kotlin", ".java": "Java", ".swift": "Swift",
};
// linguist colors, the ones GitHub uses in repo language bars
const COLOR = {
  TypeScript: "#3178c6", JavaScript: "#f1e05a", Python: "#3572A5", SQL: "#e38c00",
  Shell: "#89e051", CSS: "#663399", HTML: "#e34c26", Prisma: "#0c344b",
  Kotlin: "#A97BFF", Java: "#b07219", Swift: "#F05138",
};
const SKIP_DIR = /(^|\/)(node_modules|\.next|dist|build|coverage|\.expo|Pods)\//;
const SKIP_FILE = /(^|\/)(package-lock\.json|pnpm-lock\.yaml|yarn\.lock)$|\.min\.js$/;

const repos = process.argv.slice(2);
if (!repos.length) {
  console.error("usage: node scripts/languages.mjs <repo> [<repo> ...]");
  process.exit(1);
}

const bytes = {};
for (const repo of repos) {
  const isBlog = existsSync(join(repo, "assets", "posts.js"));
  const files = execFileSync("git", ["-C", repo, "ls-files", "-z"]).toString("utf8").split("\0");
  for (const f of files) {
    if (!f || SKIP_DIR.test(f) || SKIP_FILE.test(f)) continue;
    const ext = extname(f).toLowerCase();
    const lang = LANG[ext];
    if (!lang) continue;
    if (ext === ".sql" && /seed/i.test(basename(f))) continue;
    if (isBlog && (f.startsWith("posts/") || /^(index|404)\.html$/.test(f))) continue;
    try {
      bytes[lang] = (bytes[lang] || 0) + statSync(join(repo, f)).size;
    } catch {}
  }
}

const total = Object.values(bytes).reduce((a, b) => a + b, 0);
const languages = Object.entries(bytes)
  .sort((a, b) => b[1] - a[1])
  .map(([name, b]) => ({ name, bytes: b, pct: Math.round((b / total) * 1000) / 10, color: COLOR[name] || "#8b949e" }));
const asOf = new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);
writeFileSync("assets/languages.json", JSON.stringify({ asOf, repos: repos.length, totalBytes: total, languages }, null, 2) + "\n");
console.log(languages.map((l) => `${l.name} ${l.pct}%`).join(" · "));
