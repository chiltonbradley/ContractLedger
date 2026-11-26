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
    const reviewResponse = await clAppRoute(request, env);
    if (reviewResponse) return reviewResponse;
    const path = new URL(request.url).pathname;
    if(path==='/api/internal/extraction-check') {
      if (!env.AI_CHECK_TOKEN || !validToken(request.headers.get('Authorization') || '', `Bearer ${env.AI_CHECK_TOKEN}`)) return json({error:'unauthorized'},401);
      if(request.method!=='POST')return json({error:'method_not_allowed'},405);
      try {
        const data=Uint8Array.from(atob(CL_SYNTHETIC_PDF),c=>c.charCodeAt(0)),hash=await clHash(data);
        const sample={id:'synthetic-probe',companyId:'synthetic-probe',fingerprint:hash,files:[{name:'sample-contract.pdf',mime:'application/pdf',hash,size:data.length}],answers:{},review:{}};
        const isolatedEnv={...env,BUCKET:{async get(){return {async arrayBuffer(){return data.buffer;}};}}};
        const result=await clAnalyze(isolatedEnv,sample,{id:'synthetic-probe',folder:'synthetic-probe',policies:'No company policy is assumed.',policyApproved:false});
        const same=(a,b)=>{try{const [n,d]=clFraction(a),[m,e]=clFraction(b);return n*e===m*d;}catch{return false;}};
        const usage=result.terms.charges.find(c=>same(c.unitPriceDollars,'0.0212'));
        const seats=result.terms.charges.find(c=>same(c.unitPriceDollars,'99'));
        const verified=usage?.billingCadence==='monthly'&&same(seats?.minimumQuantity,'10');
        return json({verified,model:result.analysis.model,sourceHash:hash,exactUsageRate:usage?.unitPriceDollars||null,usageCadence:usage?.billingCadence||null,signedMinimum:seats?.minimumQuantity||null,privateCustomerDocumentsUsed:false},verified?200:502);
      }catch{return json({verified:false,error:'synthetic_extraction_failed'},502);}
    }
    if (path === '/api/internal/storage-check') {
      if (!env.AI_CHECK_TOKEN || !validToken(request.headers.get('Authorization') || '', `Bearer ${env.AI_CHECK_TOKEN}`)) return json({error:'unauthorized'},401);
      if(request.method!=='POST')return json({error:'method_not_allowed'},405);
      if(!env.DB||!env.BUCKET)return json({ready:false,error:'bindings_unavailable'},503);
      const key='_health/'+crypto.randomUUID();
      try {
        const tables=await env.DB.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name IN ('cl_companies','cl_reviews','cl_versions')").all();
        if(tables.results.length!==3)return json({ready:false,error:'schema_incomplete'},503);
        const challenge=crypto.randomUUID();await env.BUCKET.put(key,challenge);
        const object=await env.BUCKET.get(key);const verified=object&&await object.text()===challenge;
        return json({ready:!!verified,databaseTables:tables.results.length,privateFileRoundTrip:!!verified},verified?200:503);
      } catch {return json({ready:false,error:'storage_unavailable'},503);}
      finally {await env.BUCKET.delete(key).catch(()=>{});}
    }
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
