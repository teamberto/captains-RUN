// Copies the playable web files into www/, which is what Capacitor bundles
// into the iOS app. The repo root stays the source of truth so GitHub Pages
// keeps serving the same game from the same files.
import fs from 'fs';
import path from 'path';

const ROOT = path.resolve(import.meta.dirname, '..');
const WWW = path.join(ROOT, 'www');

const FILES = ['index.html', 'style.css', 'game.js', 'manifest.webmanifest',
               'icon-180.png', 'icon-512.png', 'icon-1024.png'];
const DIRS = ['vendor'];

fs.rmSync(WWW, { recursive: true, force: true });
fs.mkdirSync(WWW, { recursive: true });
for (const f of FILES) fs.copyFileSync(path.join(ROOT, f), path.join(WWW, f));
for (const d of DIRS) fs.cpSync(path.join(ROOT, d), path.join(WWW, d), { recursive: true });

// The app bundle must not reach out to the network at all.
const html = fs.readFileSync(path.join(WWW, 'index.html'), 'utf8');
const remote = html.match(/(?:src|href)="https?:\/\/[^"]+"/g);
if (remote) {
  console.error('Remote references still present in the bundle:', remote);
  process.exit(1);
}
console.log(`www/ built - ${FILES.length + DIRS.length} entries, no remote references`);
