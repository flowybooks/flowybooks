# Better Auth Wrapper

This folder contains Flowybooks' Better Auth integration. The app route at
`app/api/auth/[...all]/route.ts` delegates to these helpers, and server-side
auth checks use the session helpers in this folder.

Keep Better Auth configuration localized here so future Better Auth upgrades can
be reviewed without spreading auth-provider details across the app.

Environment variables (server):

- `BETTER_AUTH_SECRET` (required to enable Better Auth)
- `BETTER_AUTH_URL` (recommended; base URL for the app)
- `BASE_URL` (fallback app base URL)
