'use strict';
// Builds the self-contained web app: web/index.html (full page, for GitHub Pages / node server)
// and dist/artifact.html (body-only, for hosted artifact). Inlines tweetnacl so it runs offline.
const fs = require('node:fs');
const path = require('node:path');
const root = path.join(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const body = read('web/app.body.html')
  .replace('/*NACL*/', () => read('vendor/nacl-fast.min.js'))
  .replace('/*APP*/', () => read('web/app.js'));
fs.mkdirSync(path.join(root, 'dist'), { recursive: true });
fs.writeFileSync(path.join(root, 'dist/artifact.html'), body);
fs.writeFileSync(path.join(root, 'web/index.html'),
  `<!doctype html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">\n<meta name="description" content="SealTrail: co-signed, tamper-evident custody ledger that proves which handler damaged freight.">\n</head>\n<body>\n${body}\n</body>\n</html>\n`);
console.log('built web/index.html and dist/artifact.html');
