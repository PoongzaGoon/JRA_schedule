import { cp, rm } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import './resources.js';
for (const file of ['src/server.js', 'src/store.js', 'src/remote-store.js', 'src/store-schema.js', 'api/index.js', 'src/schema.js', 'src/auth.js', 'public/app.js']) execFileSync(process.execPath, ['--check', file], { stdio: 'inherit' });
await rm('dist', { recursive: true, force: true });
await cp('public', 'dist', { recursive: true });
console.log('Build complete: dist/ frontend + src/ Node server');
