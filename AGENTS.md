<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# No backwards compat in pre-production

lokri is pre-production: no external customers, no stable API contracts.
When refactoring, **clean replace > compatibility shims**. No adapters,
no optional-parameters-for-old-call-sites, no deprecation paths, no
renamed-API aliases. Bestehende call-sites werden migriert, nicht umschifft.

Tests are the safety net, not API stability. If all tests pass after a
refactor, the refactor is done.

Full details + exceptions (DB migrations, OAuth tokens, webhook contracts):
`docs/PHASE_PRINCIPLES.md`.
