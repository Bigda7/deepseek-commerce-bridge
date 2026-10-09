# Architecture

One modular Next.js application with TypeScript, React and Zod. File-based observations and attributable overrides form a versioned catalog; there is no database or automatic source refresh.

| Boundary                    | Implementation                             |
| --------------------------- | ------------------------------------------ |
| Input schemas               | `src/schemas/`                             |
| Observation normalization   | `src/ingestion/`, `src/storage/`           |
| Business rules              | `src/domain/`                              |
| Validated tools             | `src/tools/registry.ts`                    |
| DeepSeek transport and loop | `src/adapters/deepseek/`, `src/assistant/` |
| HTTP boundary               | `src/app/api/`, `src/http/`                |
| Presentation and UI         | `src/presentation/`, `src/components/`     |

Money uses integer minor units and explicit currency. Date calculations use an injectable clock. Enrollment, sessions and access remain independent. Freshness is reevaluated without changing source observation times. Exact session conversion requires approved IANA-zone/DST configuration; access calculations require approved structured policies. Calculated dates are not operational proof.

The runner accepts bounded user/assistant messages, calls registered tools and validates results. The local HTTP route supplies product context independently of client prose. Generated links must be grounded in successful tool results. Checkout authorization is server-owned; the chat route does not turn model intent into payment permission.

The UI renders catalog warnings, status and actions independently from plain model text. No merchant API is called. Production work would require authenticated durable sessions, operational availability, merchant reconciliation, verified payment events and access fulfillment; these are not implemented.
