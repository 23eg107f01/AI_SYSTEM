# Frontend performance decisions

## Route code splitting

All page-level route modules are loaded with `React.lazy` in
[`frontend/src/App.tsx`](./frontend/src/App.tsx). The shared router, authentication
provider, application shell, and lightweight loading fallback remain available
immediately. This keeps page-specific code out of the initial route module and is
especially useful for the dashboard because its Recharts dependency is only needed
when the dashboard route is opened.

`PageLoader` provides a compact accessible loading state while a route chunk is
being requested. It does not replace page-level data skeletons, which still handle
the difference between route loading and API loading.

## Caching and data fetching

React Query remains the data-fetching and caching layer. Operational queries use
shared query keys and retain successful cached data while background refreshes run.
Dashboard data refreshes every 30 seconds, escalations every 20 seconds, and ticket
lists every 60 seconds. Interval polling is disabled while the tab is hidden, and
manual refreshes invalidate or refetch the relevant query rather than creating a
second request path.

The app uses a small retry count and existing stale times to avoid request loops
when the API is unavailable. Background errors are surfaced without replacing
already-rendered cached data.

## Bundle considerations

The largest known page-specific dependency is Recharts. It is now behind the
dashboard route boundary rather than being imported by the eager application entry.
Lucide icons remain named imports at component boundaries; no broad icon namespace
or large UI framework was added.

The production build still reports Vite's existing chunk-size warning for generated
assets. Build output should be treated as the measurement source for future
splitting work; no unverified runtime improvement is claimed here.

## Avoided unnecessary rerenders

Existing `useMemo` calls are retained only for filtering and chart-data
transforms that operate on fetched collections. No blanket `React.memo` or
`useCallback` layer was added. Cached query results continue to provide stable
data between refreshes, and background refetches do not trigger full-page skeleton
replacement.
