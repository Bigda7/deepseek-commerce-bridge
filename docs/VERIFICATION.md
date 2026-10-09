# Local release verification

Verified on October 9, 2026, in Europe/Budapest, from a separate temporary copy outside the development workspace. Node.js 24.15.0, npm 11.12.1, Windows. No local credential file was copied, and generation was disabled.

| Check                                                            | Actual result                                                                                                                |
| ---------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| `npm ci --offline`                                               | Passed; locked dependencies installed from the local npm cache                                                               |
| `npm test`                                                       | Passed: 236 tests in 14 files                                                                                                |
| `npm run lint`                                                   | Passed                                                                                                                       |
| `npm run format:check`                                           | Passed                                                                                                                       |
| `npm run typecheck`                                              | Passed                                                                                                                       |
| `npm run build`                                                  | Passed; production routes compiled                                                                                           |
| `npm run check:public`                                           | Passed on the curated staged files                                                                                           |
| `node scripts/interactive-demo.mjs --interview-session`          | Preparation-only exit; zero network calls                                                                                    |
| Node syntax checks for all included `.mjs` scripts               | Passed                                                                                                                       |
| Prettier check of scripts, docs, root Markdown and workflow YAML | Passed                                                                                                                       |
| Public checker rejection probes                                  | Rejected a synthetic credential, staged `.env.local` and private evidence file; clean state passed after removing the probes |
| Markdown file links and staged whitespace check                  | Passed after adding this verification record                                                                                 |

A temporary production server bound to loopback was checked over HTTP and then stopped. The home page returned 200 with the new project name and chat-off state. The product view returned 200 with unknown enrollment and unverified access. A chat request returned 503 / provider_disabled and zero provider requests. Checkout readiness returned 409 / blocked with no payment or enrollment. The calendar endpoint returned tentative Saturday candidates without confirmed local session times.

The public catalog changes only the assignment-source title to identify the redacted scope summary. All product values, observation dates, approval states, overrides and domain policies match the original sample. The included screenshot is an unchanged, dated historical UI capture. Raw private evidence and account records are excluded.

Local review also checked copied and staged bytes against the existing private credential and known personal identifiers without displaying them. These were absent. This static review is not a comprehensive security audit.

GitHub CI is prepared with pinned official actions, read-only repository permissions and no provider credential. It has not run on GitHub; Linux execution remains pending. No remote repository, push, GitHub Release, deployment, new live model evaluation, purchase or enrollment was performed during this preparation. Historical model evaluations are summarized separately in [EVALUATION.md](EVALUATION.md).
