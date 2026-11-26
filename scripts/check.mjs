import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
const source = await readFile('dist/server/index.js', 'utf8');
const { default: worker } = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
const env = { OPENAI_API_KEY: 'test-only-secret', AI_CHECK_TOKEN: 'test-only-control-token' };
const url = 'https://contractledger.ai';
let called = 0;
const originalFetch = globalThis.fetch;
try {
  globalThis.fetch = async (target, options) => {
    called++;
    assert.equal(target, 'https://api.openai.com/v1/responses');
    assert.equal(options.headers.Authorization, 'Bearer test-only-secret');
    const payload = JSON.parse(options.body);
    assert.equal(payload.store, false);
    assert.equal(payload.max_output_tokens, 32);
    return Response.json({ status: 'completed', model: 'gpt-4.1-mini', id: 'response-test', output: [{ content: [{ type: 'output_text', text: 'ContractLedger connection verified.' }] }] });
  };
  const unauthorized = await worker.fetch(new Request(`${url}/api/internal/openai-check`, { method: 'POST' }), env);
  assert.equal(unauthorized.status, 401);
  assert.equal(called, 0);
  const response = await worker.fetch(new Request(`${url}/api/internal/openai-check`, { method: 'POST', headers: { Authorization: 'Bearer test-only-control-token' } }), env);
  assert.equal((await response.json()).connected, true);
  assert.equal(called, 1);
  const html = await worker.fetch(new Request(url), env);
  const body = await html.text();
  assert.ok(body.includes('Know where'));
  assert.ok(!body.includes(env.OPENAI_API_KEY));
  assert.ok(!body.includes(env.AI_CHECK_TOKEN));
  assert.equal((await worker.fetch(new Request(`${url}/missing`), env)).status, 404);
  globalThis.fetch = async () => Response.json({ error: { code: 'invalid_api_key', message: env.OPENAI_API_KEY } }, { status: 401 });
  const failure = await worker.fetch(new Request(`${url}/api/internal/openai-check`, { method: 'POST', headers: { Authorization: 'Bearer test-only-control-token' } }), env);
  assert.equal(failure.status, 502);
  assert.ok(!(await failure.text()).includes(env.OPENAI_API_KEY));
  console.log('Verified protected AI route, upstream request, safe errors, landing page, and no key exposure.');
} finally { globalThis.fetch = originalFetch; }
