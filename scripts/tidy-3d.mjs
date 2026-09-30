/* Runs after github-profile-3d-contrib. Removes the language pie from every
   variant: it only sees public repos, so it reported HTML at 100% while most
   of my code lives in private TypeScript repos. The languages card in the
   README shows the real mix instead. If the action changes its layout, the
   marker stops matching and the files are left untouched. */
import { readdirSync, readFileSync, writeFileSync } from "node:fs";

const DIR = "profile-3d-contrib";
const MARKER = '<g transform="translate(40, 520)">';

function removeGroup(svg, opener) {
  const start = svg.indexOf(opener);
  if (start < 0) return svg;
  const re = /<g\b|<\/g>/g;
  re.lastIndex = start;
  let depth = 0;
  for (let m; (m = re.exec(svg)); ) {
    depth += m[0] === "</g>" ? -1 : 1;
    if (depth === 0) return svg.slice(0, start) + svg.slice(m.index + 4);
  }
  return svg;
}

for (const f of readdirSync(DIR).filter((n) => n.endsWith(".svg"))) {
  const path = `${DIR}/${f}`;
  const before = readFileSync(path, "utf8");
  const after = removeGroup(before, MARKER);
  if (after !== before) writeFileSync(path, after);
  console.log(`${f}: ${after !== before ? "pie removed" : "unchanged"}`);
}
