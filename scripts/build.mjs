import { readFile, mkdir, writeFile, copyFile } from 'node:fs/promises';
const html = await readFile('site/index.html', 'utf8');
const handler = await readFile('worker/handler.mjs', 'utf8');
await mkdir('dist/server', { recursive: true });
await mkdir('dist/.openai', { recursive: true });
await writeFile('dist/server/index.js', `const LANDING_HTML = ${JSON.stringify(html)};\n${handler}`);
await copyFile('.openai/hosting.json', 'dist/.openai/hosting.json');
console.log('Built ContractLedger server and landing page.');
