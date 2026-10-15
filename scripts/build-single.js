// Inlines style.css, plan.js and app.js into one HTML page for publishing as a
// claude.ai artifact (which supplies its own doctype/head/body skeleton).
// Usage: node scripts/build-single.js [out-file]
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8');
const html = read('index.html');
const head = html.match(/<head>([\s\S]*)<\/head>/)[1];
const body = html.match(/<body>([\s\S]*)<\/body>/)[1];
const keep = head.split('\n').map((l) => l.trim())
  .filter((l) => l.startsWith('<title') || l.includes('viewport-fit-sides') || l.includes('fonts.googleapis.com'));
const page = [
  ...keep,
  `<style>\n${read('style.css')}</style>`,
  body
    .replace('<script src="plan.js"></script>', () => `<script>\n${read('plan.js')}</script>`)
    .replace('<script src="app.js"></script>', () => `<script>\n${read('app.js')}</script>`),
].join('\n');
const out = process.argv[2] || path.join(root, 'dist', 'leg-day-planner.html');
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, page);
console.log(`Wrote ${out} (${page.length} bytes)`);
