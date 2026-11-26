// Pass {url, token} through hidden stdin. Never put credentials in arguments.
process.stdin.setEncoding('utf8');
if (process.stdin.isTTY) process.stdin.setRawMode(true);
process.stdout.write('Ready for connection-check JSON on stdin (input is hidden).\n');
const config = await new Promise((resolve, reject) => {
  let input = '';
  const consume = chunk => {
    input += chunk;
    if (!/[\r\n]/.test(input)) return;
    process.stdin.off('data', consume);
    if (process.stdin.isTTY) process.stdin.setRawMode(false);
    process.stdin.pause();
    process.stdin.unref();
    try { resolve(JSON.parse(input.trim())); } catch { reject(new Error('Invalid verification input.')); }
  };
  process.stdin.on('data', consume);
});
try {
  const origin = new URL(config.url);
  if (!['https://contractledger.ai', 'https://contractledger-coming-soon.jlchiltoncpa-7539.chatgpt.site'].includes(origin.origin)) throw new Error('Unexpected site origin');
  const health = await fetch(new URL('/api/health', origin), { signal: AbortSignal.timeout(30000) });
  const healthResult = await health.json();
  const unauthorized = await fetch(new URL('/api/internal/openai-check', origin), { method: 'POST', signal: AbortSignal.timeout(30000) });
  const response = await fetch(new URL('/api/internal/openai-check', origin), {
    method: 'POST', headers: { Authorization: `Bearer ${config.token}` }, signal: AbortSignal.timeout(35000),
  });
  const result = await response.json();
  const landing = await fetch(origin, { signal: AbortSignal.timeout(30000) });
  const html = await landing.text();
  const output = { healthStatus: health.status, health: healthResult, anonymousCheckStatus: unauthorized.status, checkStatus: response.status, result, landingStatus: landing.status, landingIntact: html.includes('Know where') };
  console.log(JSON.stringify(output));
  if (!response.ok || !result.connected || unauthorized.status !== 401 || !output.landingIntact) process.exitCode = 1;
} catch {
  console.log(JSON.stringify({ verified: false, error: 'Connection check could not complete.' }));
  process.exitCode = 1;
}
