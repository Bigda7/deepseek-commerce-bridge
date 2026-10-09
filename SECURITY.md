# Security

This is a local prototype, not a publicly authenticated service. It binds to loopback, keeps provider credentials server-side and disables generation by default. Do not expose it directly through a public tunnel or hosting configuration without adding durable authentication and usage controls.

Never post an API key, raw provider ledger, payment data or customer details in an issue or pull request. Rotate any exposed credential promptly. The public-file checker is a limited static check, not a comprehensive security audit.

After publication, use the repository's private vulnerability-reporting channel if enabled. If no private channel exists, ask the maintainer to establish one without disclosing exploit details or private data publicly. No external security inbox or support commitment is configured yet.
