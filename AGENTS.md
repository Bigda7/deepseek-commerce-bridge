# Repository instructions

- Write code, identifiers, comments, configuration, tests and commit messages in English. Do not use emojis in code.
- Inspect Git status and preserve unrelated user changes. Do not publish, push, enable paid generation or change merchant accounts without explicit authorization.
- Read README.md, docs/ARCHITECTURE.md and docs/EVALUATION.md before behavioral changes; read docs/DEEPSEEK_ADAPTER.md before model/tool changes and data/README.md before catalog changes.
- Keep schemas, observations, overrides, domain services, provider adapters, tools and UI separate. Use the same canonical catalog for tools and HTTP/UI exports.
- Product evaluation uses DeepSeek only; automated tests use offline fixtures or mocked HTTP. Do not silently fall back to another provider or imply that this prototype changes standard DeepSeek.
- Use contextual business/product IDs. Keep the annual group program separate from private lessons and monthly offers.
- Retain sources, observation dates, verification states and attributable approvals. Unknown values stay null; do not invent prices, billing, taxes, refunds, discounts or availability.
- The sample program is ongoing. An old launch date must not close it, and ongoing must not imply open enrollment.
- Model enrollment, recurring sessions and access separately. Saturday candidates are tentative; no exact local time without approved IANA zone/DST rules, or access dates without approved activation/expiry rules.
- Deterministic code handles money, dates, freshness and authorization. Validate tool arguments server-side; model intent and earlier assistant prose are not action permission or evidence.
- Keep credentials server-side. Live generation is off by default and requires explicit opt-in and an agreed budget. Use finite loops, timeouts and failure responses.
- Only approved, matching destinations can be offered, with freshness/unresolved-term disclosure. A redirect is not proof of payment. Block unsupported checkout creation; never collect card details.
- Do not commit environment credentials, raw provider sessions, private correspondence, account balances, customer data or recordings. Preserve .env.local; examples contain placeholders only.
- Run checks relevant to the change. For release work, run tests, lint, formatting, type checking, build and npm run check:public. Do not create tests for documentation-only edits.
- Document actual results and limitations in docs/VERIFICATION.md. Do not claim successful live purchases, business approval, deployment or GitHub CI execution without evidence.
- Do not spawn subagents unless explicitly authorized by the user or applicable instructions.
