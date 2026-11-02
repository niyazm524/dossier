# Custom job catalogue

Dossier reads one external HTTP catalogue. The catalogue owns source sessions,
scraping, SQLite, search subscriptions and deduplication. Dossier owns the profile,
scoring, tailored documents and applications. No scraping runs in Dossier.

## Connect

Settings → Job search → Custom. Save a base Service URL, optionally a username
and password, then use Test connection. For example, `http://jobfeed:8000` on a
shared Docker network, or `http://host.docker.internal:8000` for a service on the
Docker Desktop host. `localhost` inside the app container refers to that container.
Base path prefixes are supported, e.g. `https://feed.example/catalogue`.
The URL must not contain embedded credentials, a query string or a fragment.
Use HTTPS outside a trusted local network. Private Docker hosts are deliberately
allowed: only the signed-in owner configures the service URL.

The optional password is encrypted using the existing job-source secret mechanism
and is never returned to the browser. A changed URL or username requires re-entering
the password. Endpoint and credentials belong to this installation: exports omit
them, even when exporting API keys, and imports preserve the local values.

## API contract, version 1

All calls are GET requests with `Accept: application/json`. When configured, all
calls include `Authorization: Basic ...`. Redirects are refused, with a 10-second
request timeout and 5 MiB response limit. No external response error body is shown.

`GET {base}/health` returns HTTP 200 with `{ "status": "ok" }`. This must not create
a search subscription. Test connection uses only this endpoint.

`GET {base}/v1/jobs` receives these query parameters:

| Parameter | Meaning |
| --- | --- |
| `keywords` | Search text |
| `place` | City/region, possibly empty |
| `country` | Lowercase ISO country code |
| `radiusKm` | 10, 25, 50, 100 or 200 |
| `remoteOnly` | `true` or `false` |
| `postedWithin` | `any`, `day`, `3days`, `week` or `month` |
| `limit` | Currently 20; response allows at most 100 items |
| `cursor` | Optional opaque pagination token, never followed as a URL |

The catalogue registers or refreshes the normalized search subscription, reads its
stored results and responds immediately. It collects upstream sources separately.
Exclude `limit` and `cursor` from subscription identity. The backend must apply the
filters it accepts; Dossier does not pretend they were applied. Unsupported filters
should produce an explicit error, not silently broaden results.

First request while nothing has been collected:

```json
{
  "items": [],
  "nextCursor": null,
  "searchStatus": "pending",
  "lastSuccessfulSyncAt": null
}
```

Dossier shows “Search registered. Results are being collected; run this search again
later.” It does not save this as a completed empty search. No automatic polling is
introduced: run the same search again, or let the existing daily job agent do so.

Ready response (illustrative schema example, not a connected source):

```json
{
  "items": [{
    "id": "stable-canonical-id",
    "title": "Content Lead",
    "company": "Example",
    "location": "Remote — Armenia",
    "remote": true,
    "salary": "",
    "postedAt": null,
    "url": "https://jobs.example/1",
    "via": "Remocate, Wantapply",
    "description": "Full plain-text vacancy description.",
    "complete": true
  }],
  "nextCursor": null,
  "searchStatus": "ready",
  "lastSuccessfulSyncAt": "2026-11-02T00:00:00.000Z"
}
```

`searchStatus` defaults to `ready` if omitted. `lastSuccessfulSyncAt` is optional
and validated when present; it is not currently displayed. All item fields above
are required except `via`, which defaults to an empty string. `remote` can be null,
`postedAt` is a UTC ISO timestamp or null. Keep all text within the shared Dossier
limits (title 500, company/location 300, salary 200, description 100000 characters).
Only http(s) vacancy URLs or an empty string are accepted. A complete description
cannot be empty. Incomplete records may be displayed, but Dossier does not scrape
their pages for missing text. Refresh the catalogue and run the search again.

Return `ready` with an empty items array for a completed zero-result search. Return
`ready` with cached results if an upstream source fails; keep collection diagnostics
on the Python side. A catalogue/API failure must return an HTTP error. `401`/`403`
mean access refused, `429` rate limited, `5xx` unavailable. Malformed responses are
reported as a changed source contract; no invalid item is silently accepted.

Pagination tokens must advance. IDs must be stable across searches, pagination,
updates and restarts. Dossier maps `id` → `externalId`, `location` → `place` and
sets `source=CUSTOM`. Canonical IDs belong to one catalogue; replacing the configured
service must preserve that ID namespace. Keep source aliases in the Python DB.

Every new Custom search bypasses Dossier's 30-minute source cache so registration
and newly collected results reach the service. Historical search pages remain
snapshots, as with other sources: reopening one does not query the service.

## Migration and checks

The only database schema change is adding `CUSTOM` to `PostingSource`; connection
settings use the existing `Setting` table. No scraper or search_request table is
added to Dossier. Apply the committed migration with `prisma migrate deploy`,
regenerate the client with `prisma generate`, then restart the app process.

The Python catalogue implementing this contract is a separate next step. The
contract tests use explicit HTTP fixtures; no live Remocate/Wantapply collection
or external application sending is performed by these tests.
