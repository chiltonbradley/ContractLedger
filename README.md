# ContractLedger.ai

Coming-soon website for ContractLedger.ai, powered by VoltBoost.ai.

Live website: https://contractledger.ai

## Build and verify

Run `node scripts/build.mjs` then `node scripts/check.mjs`. Source HTML is in `site/index.html`; the server is in `worker/handler.mjs`. The build embeds the landing page in a dependency-free Cloudflare Worker at `dist/server/index.js`.

## OpenAI connection

Runtime variables are configured in Sites, never in source or client code:

- `OPENAI_API_KEY`: secret deployment copy of the key saved in Azure Key Vault `kv-contractledger-prod`, secret `ocl-penai-api-key`.
- `OPENAI_MODEL`: selected model, currently `gpt-4.1-mini`.
- `AI_CHECK_TOKEN`: separate secret required for the internal connection check.

`GET /api/health` reports configuration presence without making a paid model request. `POST /api/internal/openai-check` requires `Authorization: Bearer <AI_CHECK_TOKEN>` and makes one fixed, short OpenAI Responses API request with response storage disabled. Anonymous calls are rejected before contacting OpenAI. No general public AI proxy is exposed.

Key Vault and Sites are separate secret stores. Rotating the original key requires updating the Sites runtime secret and deploying to apply it. The vault's secrets are not fetched by the public browser.

## Scope

The payer/payee illustration uses sample data. Contract uploads, OCR, and contract review remain planned capabilities. No email or signup form is configured.

## Publishing

The `.openai/hosting.json` Site identity is retained. Publish using the Sites source workflow. GitHub holds a source mirror; pushes there do not automatically deploy to Sites.
