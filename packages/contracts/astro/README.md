# Astro Contracts

PR18 introduces JSON-serializable chart snapshot contracts for the Python astro calculation service.

- `chart-snapshot.schema.json` describes deterministic natal/transit chart snapshots.
- The Next.js web app must consume these outputs as data contracts only; it must not calculate planetary positions.
