import { mkdir, copyFile } from 'node:fs/promises';
// An explicit allowlist keeps research caches, credentials and project docs out
// of the public Pages artifact. No third-party packages are required.
for (const directory of ['_site', '_site/assets', '_site/data']) await mkdir(directory, { recursive: true });
for (const file of ['index.html', '.nojekyll', 'assets/app.js', 'assets/styles.css', 'assets/data-state.mjs', 'data/typhoons.json', 'data/status.json']) {
  await copyFile(file, `_site/${file}`);
}
console.log('Pages artifact ready: _site');
