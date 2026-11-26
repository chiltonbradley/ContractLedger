# ContractLedger.ai

Contract intelligence and a private guided revenue-review pilot, powered by VoltBoost.ai.

Live landing page: https://contractledger.ai
Private pilot: https://contractledger.ai/app

## Build and checks

- `node scripts/build.mjs`
- `node scripts/check.mjs`
- `node scripts/check-review.mjs`
- `node scripts/dev-review.mjs` starts a local-only synthetic-data preview. It never calls OpenAI and holds no real customer documents.

`site/index.html` and `site/app.html` are the user interfaces. `worker/review-domain.mjs` contains schema validation and deterministic calculations. `worker/review-api.mjs` owns authentication, company isolation, source integrity, persisted revisions, full-packet AI extraction, and draft approval. Build output is a self-contained Worker at `dist/server/index.js`.

## Private pilot and storage

The public landing page remains public. Review APIs require platform-authenticated identity and the configured `REVIEW_OWNER_EMAIL` pilot allowlist. Every company and review is checked server-side against its owner; no JLC Microsoft identity or permission is imported. Company setup requires a private save-folder name. D1 stores company settings, review snapshots and immutable revision history; R2 stores original packets and separate period evidence. Private PDFs are served only after authorization and SHA-256 verification. No public document URLs or external PDF viewers are used.

The initial pilot is single-owner. Shared company membership, SharePoint folder access and external ledger posting require separately implemented, authorized integrations. They are not simulated. No journal is posted or scheduled by this version.

Schema migrations live in `drizzle/` and are applied by Sites before deployment. Do not create or mutate schema during requests. Applied migrations are immutable.

## Guided review

1. Full original packet and amendments are read before editable, prefilled contract/customer terms are shown.
2. Every charge has its own exact decimal unit rate, signed minimum, other established quantity, classification, billing cadence/timing, service dates and source citation. Unknown is not zero. Original versus amended snapshots are linked; amendments pause approval of the preceding review. Reopening or confirming unchanged values triggers no model call or version mutation.
3. Professional review includes proposed performance obligations, five-step findings and applicable exceptions; company policy; relative SSP where required; GL mappings; explicit opening-book context and performance/billing coverage. Genuine missing operational questions are asked one at a time and saved. Material corrections require a fresh full-packet analysis before approval.
4. Monthly schedules distinguish fixed consideration, actual variable activity, planning estimates, evidenced billing, deferred revenue and contract assets. Calculations use exact decimal/rational multiplication, final integer cents, cumulative allocation and balanced journal drafts. Approval is bound to exact source/terms/policy/accounts/entries and is invalidated by changes. JSON export says whether the draft is approved and always says `posted:false`.

Daily over-time, evidenced point-in-time and reconciled manual fixed-obligation recognition are supported. A separately approved company-specific new-user cohort policy can recognize actual cohorts over their own reviewed number of months. A scheduled end or renewal does not trigger a cohort deferral release; an actual official termination requires its own evidence and confirmation. The company-specific cohort method is not asserted to be a universal ASC 606 rule. Complex billing proration, unsupported currency precision, unproven SSP or missing operational/accounting facts remain approval blockers.

Period-support PDFs, images and text/CSV files are read into proposed invoices and actual activity, with source quotes and hashes. Human verification is required before applying rows; overlapping selections, prepaid purchases, unmatched customers/rates and unknown consumption are blocked. Matching invoice reference/date or charge/month actuals explicitly replace earlier evidence, retain history and reopen financial review. Manual corrections remain available; this pilot does not claim to automatically determine consumption from invoice dollars. There is no QBO/legacy schedule matching, cash recognition, automatic data migration, or forced reconciliation to a prior system.

## Server-held configuration

- `OPENAI_API_KEY`: protected runtime copy of the key in Azure Key Vault `kv-contractledger-prod`, secret `ocl-penai-api-key`.
- `OPENAI_MODEL`: currently `gpt-4.1-mini`.
- `AI_CHECK_TOKEN`: protected token for fixed internal probes.
- `REVIEW_OWNER_EMAIL`: protected private-pilot allowlist.

No secret goes into browser code or GitHub. Key Vault and Sites are separate stores: rotating the vault key requires updating the Sites runtime secret and deployment. OpenAI requests use `store:false`. Uploaded contract instructions are treated as untrusted data.

`GET /api/health` makes no model call. `POST /api/internal/openai-check`, `/api/internal/storage-check` and `/api/internal/extraction-check` require the internal token. Probes use only fixed synthetic data. The storage probe checks applied tables and a temporary private-file round trip. The extraction probe reads a synthetic PDF and checks the exact $0.0212 rate and signed minimum independently. They cannot accept private contracts or arbitrary model prompts.

## Publishing

The existing `.openai/hosting.json` Site identity is retained with DB/BUCKET bindings. Publish with the Sites workflow. GitHub is a source mirror; pushing GitHub does not automatically deploy Sites.
