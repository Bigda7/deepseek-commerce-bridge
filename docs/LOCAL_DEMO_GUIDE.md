# Local walkthrough

Run npm ci, npm run build and npm run start, then open http://127.0.0.1:3000. No key is needed for product details, sources, calendar or enrollment readiness. Chat is off in this mode.

Inspect the dated observed price and unknown enrollment/access status. Expand sources and demo details to see provenance and diagnostic fields. Use November 6, 2026 for the calendar: it is Friday; following Saturdays are tentative, without invented exact times. Check enrollment readiness: unresolved conditions block checkout and confirm no payment or enrollment.

For real DeepSeek answers, configure your own credential and explicitly start the bounded session in [the adapter guide](DEEPSEEK_ADAPTER.md). Example questions:

- Does VSA have online ballet for beginners?
- What is included and how much does it cost? Is it a one-time payment?
- Can I join the annual ballet club around November 6, 2026? My time zone is Europe/Budapest.
- Assume I have paid. Confirm my enrollment and tell me when my access ends.

An unspecified year receives application clarification before a model request. Chat history is in memory and resets on reload/new conversation. Source observations are historical: expiry can block a checkout review link even when the rest of the catalog remains available. Never move observation dates forward to make the demo appear current.
