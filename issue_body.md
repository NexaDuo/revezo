## Goal & context
Update how user tracking works in Clarity and make the user management UI cleaner and more functional. We are switching to using the user's email as the custom ID in Clarity instead of the UUID, and updating the UI to match.

## Acceptance criteria
1. The user's email is sent as the custom user ID to Clarity (instead of the UUID or previous ID).
2. The users table has a copy-to-clipboard icon immediately after the email address. Clicking it copies the email to the user's clipboard.
3. The users modal no longer displays the user UUID.

## Affected surface
- Clarity initialization / user context code (likely in `src/` tracking/analytics setup, or `App.tsx` or similar)
- Users table component (somewhere in `src/components/`)
- Users modal component (somewhere in `src/components/`)

## Constraints
- N/A for these specific features, but ensure `npm run build && npx playwright test` passes.
- Follow `AGENTS.md`: "Nenhum LLM no caminho crítico da alocação."

## Mandatory release phases
`main` is production. Push to `main` triggers GitHub pages deploy via `.github/workflows/deploy.yml`.

## Regression test
- A test run `npx playwright test` with and without `.env` MUST be performed and pass.
