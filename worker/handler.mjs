const securityHeaders = {
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
};

function json(value, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: { ...securityHeaders, 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
  });
}

function validToken(actual, expected) {
  if (!expected || actual.length !== expected.length) return false;
  let different = 0;
  for (let i = 0; i < actual.length; i++) different |= actual.charCodeAt(i) ^ expected.charCodeAt(i);
  return different === 0;
}

export default {
  async fetch(request, env) {
    const path = new URL(request.url).pathname;
    if (path === '/api/health') {
      if (request.method !== 'GET') return json({ error: 'method_not_allowed' }, 405);
      return json({ ok: true, aiConfigured: Boolean(env.OPENAI_API_KEY), service: 'ContractLedger.ai' });
    }

    if (path === '/api/internal/openai-check') {
      const authorization = request.headers.get('Authorization') || '';
      if (!validToken(authorization, `Bearer ${env.AI_CHECK_TOKEN || ''}`) || !env.AI_CHECK_TOKEN) {
        return json({ error: 'unauthorized' }, 401);
      }
      if (request.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);
      if (!env.OPENAI_API_KEY) return json({ connected: false, error: 'not_configured' }, 503);
      try {
        const response = await fetch('https://api.openai.com/v1/responses', {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${env.OPENAI_API_KEY}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model: env.OPENAI_MODEL || 'gpt-4.1-mini',
            input: 'Reply with exactly: ContractLedger connection verified.',
            max_output_tokens: 32,
            temperature: 0,
            store: false,
          }),
          signal: AbortSignal.timeout(25000),
        });
        const result = await response.json();
        if (!response.ok) {
          const knownCodes = ['invalid_api_key', 'insufficient_quota', 'rate_limit_exceeded', 'model_not_found'];
          const code = knownCodes.includes(result.error?.code) ? result.error.code : 'provider_error';
          return json({ connected: false, error: code, providerStatus: response.status }, 502);
        }
        const text = (result.output || []).flatMap(item => item.content || [])
          .filter(item => item.type === 'output_text').map(item => item.text).join('');
        if (result.status !== 'completed' || text.trim() !== 'ContractLedger connection verified.') {
          return json({ connected: false, error: 'unexpected_response' }, 502);
        }
        return json({ connected: true, model: result.model, response: text, responseId: result.id, usage: result.usage });
      } catch {
        return json({ connected: false, error: 'provider_unavailable' }, 502);
      }
    }

    if ((path === '/' || path === '/index.html') && ['GET', 'HEAD'].includes(request.method)) {
      return new Response(request.method === 'HEAD' ? null : LANDING_HTML, {
        headers: { ...securityHeaders, 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'public, max-age=60' },
      });
    }
    return json({ error: 'not_found' }, 404);
  },
};
