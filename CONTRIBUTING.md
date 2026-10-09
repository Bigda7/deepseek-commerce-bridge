# Contributing

Use Node.js 24.x and the locked npm dependencies. Follow AGENTS.md and the documented catalog/adapter boundaries.

For a behavioral change, describe its trigger and resulting behavior, add meaningful offline regression coverage and run tests, lint, formatting, type checking and production build. Run npm run check:public before preparing a commit. Do not use real provider credentials in tests or silently broaden paid-generation limits.

Keep product claims attributable. Test approvals are fixtures, never actual approvals. Submit compact changes with actual validation results and known limitations. Report security issues using SECURITY.md rather than exposing credentials or private records in a public issue.
