# Evaluation

Product evaluations used DeepSeek only. Offline automated tests use injected fixtures or mocked HTTP and are separate from real-provider evaluation.

Six ordinary-web baseline queries were recorded before connecting project data, each in a fresh chat with DeepThink and Smart Search enabled. The exact web model ID was not exposed. They covered both brand names, beginners, advanced/professional audience, annual participation from home, price/inclusions and joining. Some responses mixed the assigned ballet offer with other products; one transferred a USD 199 price from another offer.

The connected prototype used deepseek-flash, thinking disabled, catalog tools and no external search. Saved evaluations covered discovery, observed price/renewal, date clarification, official-link review, injection/update fixtures and refusal to invent payment/access. Failures led to targeted fixes; selected successful results do not imply every response passed.

These configurations differ. The comparison does not prove that public DeepSeek changed, establish improved external search discovery or measure a controlled same-model effect. Ordinary native-after and statistical repetitions were not run. No purchase, enrollment or access grant was performed. Raw records remain private because they include session/account metadata; this public summary is not a replacement for full run transcripts.

## Reproducible acceptance checks

| Area             | Required behavior                                                                             |
| ---------------- | --------------------------------------------------------------------------------------------- |
| Catalog          | Reject malformed/dangling fields; keep source states, version changes and override precedence |
| Product identity | Resolve VSA contextually; do not substitute annual group for private/monthly offers           |
| Money            | Integer minor units, explicit currency, observed price distinguished from approval            |
| Dates            | Injectable clock, ambiguous-year clarification, tentative Saturdays, DST edge cases           |
| Access           | Unknown dates without approved policy; caller assertions do not verify entitlement            |
| Checkout         | Freshness, allowlist, product mapping and authorization; unresolved conditions block actions  |
| Model boundary   | Validate arguments, bound calls/timeouts, reject ungrounded links and injection               |
| HTTP/UI          | Loopback/origin checks, cancellation/errors and independent domain warnings                   |

Run the commands in README.md. [VERIFICATION.md](VERIFICATION.md) records actual local results. GitHub CI must be reported separately after it has actually run.
