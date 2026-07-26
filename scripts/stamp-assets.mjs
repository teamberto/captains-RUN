// Adds a ?v=<timestamp> to the local css/js links in index.html.
// GitHub Pages serves everything with max-age=600, so a browser can end up
// holding a fresh index.html alongside a stale game.js - which shows up as
// half-updated UI. The stamp makes each deploy a distinct URL.
import fs from 'fs';
import path from 'path';

const ROOT = path.resolve(import.meta.dirname, '..');
const file = path.join(ROOT, 'index.html');
const stamp = new Date().toISOString().replace(/\D/g, '').slice(0, 12);

let html = fs.readFileSync(file, 'utf8');
html = html
  .replace(/href="style\.css(\?v=\d+)?"/, `href="style.css?v=${stamp}"`)
  .replace(/src="game\.js(\?v=\d+)?"/, `src="game.js?v=${stamp}"`)
  .replace(/src="vendor\/three\.min\.js(\?v=\d+)?"/, `src="vendor/three.min.js?v=${stamp}"`);
fs.writeFileSync(file, html);
console.log('asset stamp:', stamp);
