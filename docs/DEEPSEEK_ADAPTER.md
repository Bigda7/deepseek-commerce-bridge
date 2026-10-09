# DeepSeek adapter and local demo

The provider transport, tool runner and local chat route are implemented. Standard generation is off by default; disabling it returns HTTP 503 / provider_disabled with zero provider requests and an independent catalog view.

## Enable a bounded session

1. Use Node.js 24.x, run npm ci and npm run build.
2. Copy .env.example to .env.local without overwriting existing credentials.
3. Enter a server-side API key. Confirm current account/model availability and pricing before spending.
4. Run npm run demo:live and open http://127.0.0.1:3001.
5. Stop with Ctrl+C; the process also expires automatically after 60 minutes.

This opt-in harness fixes deepseek-flash with thinking disabled, permits at most 12 chat attempts and 30 provider requests, and checks a conservative USD 0.10 estimate target. Recorded rates are from October 7, 2026; the guard is not a provider-enforced spending cap. A single answer can use multiple requests. Errors, missing usage or model mismatch stop generation; do not restart to bypass a stop without reviewing its cause. Startup performs a read-only balance check; no model prompt is sent automatically.

Raw prompts, outputs, usage and a balance snapshot are written locally under docs/evidence/. They are ignored by Git and must not be uploaded publicly without a separate privacy review. The key is redacted from captured records. A process marker under tmp/ supports the Windows helper scripts/stop-interview-demo.ps1; it verifies PID, command and listener before stopping a matching demo. Standard npm start on port 3000 remains separate.

## Input and tools

POST /api/chat accepts user/assistant text only: at most 20 messages, 4000 characters each and 12000 total. The last message must be from the user. Client system/tool messages, extra authorization fields and arbitrary product IDs are rejected. Prior assistant text is not trusted evidence. The endpoint accepts same-origin loopback requests only, one active turn and four starts per minute per process.

The seven tools are search_products, get_product, get_enrollment_status, get_next_sessions, get_access_period, get_enrollment_option and prepare_checkout. Their validated catalog/domain data supplies facts. Failed or unknown results grant no navigation/action rights. A model-supplied enrollment intent does not authorize checkout, and a payment assertion does not establish enrollment or access.

The HTTP route does not authorize prepare_checkout from chat prose. The independent readiness action evaluates a product-specific request without creating a provider session. Observed official review links require matching IDs, allowlisted destinations and fresh evidence. No fallback model, live website lookup, merchant purchase or entitlement grant is performed.
