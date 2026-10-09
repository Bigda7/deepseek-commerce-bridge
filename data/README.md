# Catalog configuration

The application reads the observations and approval overrides on every request. A content hash is included in the catalog version, so catalog edits are reflected without changing a prompt, rebuilding, or manually bumping a version. Production deployments still need a writable configuration strategy or a redeployment if files are bundled read-only. The separate `domain-policy.json` is imported as a module; changing that operational policy requires a server restart or rebuild.

## Observations

Edit `observations/victory-skating.json` for a dated manual import from the assigned sources. This is not an automatic website synchronizer.

- Every product field has `value`, `status`, `sourceIds`, and `notes`.
- Use `confirmed` for facts explicitly established by the assignment or supported by attributable business approval.
- Use `observed` for website and checkout observations. Keep the original source date and, where known, exact timestamp.
- Use `unknown` or `conflicting` with `value: null` when a value cannot safely be selected.
- Use `stale` only with retained evidence and a value, explaining why it needs a refresh. Domain services additionally calculate effective freshness at request time without rewriting the observation.
- Store money in integer minor units with an explicit currency. The initial checkout observation is `17900` USD minor units; it is not business-approved pricing.
- Crossed-out amounts, per-class marketing, and other offers belong in `observations`, not the annual payable price.
- Do not set a canonical time zone, current enrollment availability, or access dates by inference.

The schemas reject extra fields, invalid money, dangling references, duplicate IDs, and known values incorrectly marked as unknown. They cannot independently prove that a manually attributed source or approval is authentic.

## Business-approved overrides

`overrides/business-approved.json` currently contains no changes because no business approval has been received. Keep it empty until there is an attributable approval. A hypothetical override has this shape; the following is documentation only and must not be presented as a real approval:

```json
{
  "schemaVersion": 1,
  "version": "example-not-approved",
  "changes": [
    {
      "id": "example-price",
      "productId": "vsa-annual-online-ballet",
      "approval": {
        "approvedBy": "EXAMPLE ONLY",
        "approvedAt": "2026-10-07T10:00:00Z",
        "reason": "Illustration only, not a received business approval."
      },
      "facts": {
        "price": {
          "value": { "amountMinor": 18900, "currency": "USD" },
          "notes": "Hypothetical value for format documentation only."
        }
      }
    }
  ]
}
```

Overrides are validated against the same field types, acquire their own approval source, and take precedence over refreshed observations. Duplicate overrides for the same field are rejected; update the existing approval entry and preserve the previous revision in version control. Original manual observations are never overwritten by the normalizer.

## Local catalog API

- `GET /api/products`: list the catalog.
- `GET /api/products?q=VSA%20online%20ballet`: lexical candidate search.
- `GET /api/products?businessId=victory-skating&q=VSA`: explicit business context for an acronym.
- `GET /api/products/vsa-annual-online-ballet`: full facts, observations, source references, uncertainty warnings, and catalog version.

Search is a small deterministic candidate selector for this catalog, not a general natural-language parser. A bare acronym without product or business context is not automatically assigned to Victory Skating. Private-only and monthly-only searches do not substitute the annual group offer.

Errors use `invalid_input` (400), `unknown_product` (404), or `catalog_unavailable` (503). Invalid catalogs fail closed. HTTP responses use `Cache-Control: no-store` for successful reads.

## Domain policy and business rules

`domain-policy.json` is developer-owned operational configuration, not a received business approval. It sets a 900-second enrollment evidence lifetime and 86400-second checkout/commercial evidence lifetimes. Evidence is stale at the exact expiry boundary; future-dated evidence is rejected. When a source has only `observedOn`, age is conservatively calculated from midnight UTC on that date. `checkedAt` is the evaluation time, not a fresh lookup timestamp. The exact product ID, URL and checkout title must match the configured allowlist.

Current enrollment requires attributable business approval and fresh evidence. The real catalog has neither a confirmed open status nor live operational lookup. An ongoing program does not imply availability.

Exact session conversion requires approved `localStartTime`, `timeZone` and the supported `dstPolicy` value `follow_canonical_zone`. A user zone may be a recognized IANA location or `UTC`; marketing labels such as `EDT` are rejected. Approved exceptions are excluded. All generated dates remain tentative; no confirmed session feed exists. Ambiguous or nonexistent wall times return no exact instant. Without a canonical schedule, dates are nominal program-calendar candidates, not user-local appointments.

Executable access rules must be approved structured values. For example, `accessStartRule.value` may be `{ "trigger": "payment_confirmed" }` and `accessEndRule.value` may be `{ "unit": "calendar_year", "years": 1, "boundary": "exclusive", "leapDayRule": "clamp_to_february_28" }`. The alternative leap-day rule is `march_1`; the alternative trigger is `enrollment_confirmed`. These are supported formats, not actual product terms. Legacy prose is retained but not executed. A caller-supplied activation reference produces only a calendar-policy preview with `entitlementVerified: false`, never granted access or an exact expiry instant.

## Local domain API

Use `vsa-annual-online-ballet` in place of `:id`:

| Request                                                                                          | Behavior                                                                                                                |
| ------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------- |
| `GET /api/products/:id/enrollment`                                                               | Separate availability, freshness, ongoing state and `liveLookupPerformed: false`                                        |
| `GET /api/products/:id/sessions?referenceDate=2026-11-06&userTimeZone=Europe%2FBudapest&limit=3` | Friday reference; tentative Saturday candidates, with no exact times on current data                                    |
| `GET /api/products/:id/access`                                                                   | Unknown policy on current data; null access dates                                                                       |
| `GET /api/products/:id/access?activationDate=2026-10-07&activationEvent=payment_confirmed`       | Supplied event is not trusted as payment; dates remain null unless approved rules allow a preview                       |
| `GET /api/products/:id/enrollment-option`                                                        | Fresh observed official link for reviewing terms, or blocked/null when expired, mismatched or confirmed closed          |
| `POST /api/checkout`                                                                             | Readiness check with JSON `{ "productId": "vsa-annual-online-ballet", "intent": "enroll" }`; currently HTTP 409 blocked |

Domain envelopes contain `status`, `data`, `warnings`, `sources`, `checkedAt`, `catalogVersion` and `dataMode: catalog_evaluation_without_live_lookup`. No model or external provider request is performed. A hypothetical fully approved configuration may yield `approved_hosted_link`; it still returns `sessionCreated`, `paymentConfirmed`, `accessGranted` and `externalRequestPerformed` as false. Repeated requests create no sessions. Required terms include price, billing, charges, cancellation/refund rules, resolved commercial discrepancies, structured access rules and current open enrollment.

Input schemas reject unknown or duplicated query parameters, incomplete/invalid calendar dates, unsupported zones and limits outside 1-12. Checkout accepts only JSON, has an 8192-byte body limit, and rejects injected payment flags or arbitrary URLs. Domain HTTP errors use 400/404/503, plus 413 for oversized bodies, 415 for unsupported media type and 409 for blocked readiness. Domain responses, including errors, use `Cache-Control: no-store`.

There is no public edit endpoint, live availability check, generated checkout session, provider webhook or payment confirmation at this stage. A local chat HTTP endpoint/UI, DeepSeek service and tool registry exist; provider responses are tested offline and real generation remains disabled by default. See [the adapter guide](../docs/DEEPSEEK_ADAPTER.md). No merchant credentials are required for these local checks.

## P6 presentation and local chat API

- `GET /api/products/:id/view`: validated presentation DTO, built from the same canonical catalog and domain services; refresh is local reevaluation, not live ingestion.
- `GET /api/products/:id/review-checkout`: rechecks checkout freshness, product mapping and allowlist immediately before returning a 303 redirect. An expired or mismatched destination returns 409 with no Location. No external fetch, session creation or payment occurs.
- `POST /api/chat`: bounded messages-only JSON, same-origin loopback only, one active turn and four starts per minute per process. Returns assistant metadata plus independent product view, tool notices and warnings. No action authorization is accepted from the body or inferred from model text. Disabled generation returns 503 `provider_disabled`, zero provider requests and the catalog view. Full contract: [adapter guide](../docs/DEEPSEEK_ADAPTER.md).

All new endpoints use `Cache-Control: no-store`. Model text is rendered as escaped plain text; action links come from structured catalog data. User-facing walkthrough: [local demo guide](../docs/LOCAL_DEMO_GUIDE.md).

## Verification

Run `npm test`, `npm run typecheck`, `npm run lint`, `npm run format:check`, and `npm run build`. Tests cover schema rejection, evidence references, observation/approval precedence, version changes, contextual search, freshness boundaries, calendar/DST cases, access policy, checkout restrictions and HTTP error behavior. Test approvals are explicitly labeled fixtures and are not stored in the actual override file.
