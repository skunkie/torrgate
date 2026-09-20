<!--
SPDX-FileCopyrightText: 2026 TorrPlay

SPDX-License-Identifier: MIT
-->

# TorrGate

TorrGate is a high-performance, modular TypeScript API gateway and proxy for torrent trackers. It provides Jackett-compatible API endpoints adhering to the canonical REST v2.0 path space (`/api/v2.0/indexers/...`), supporting JSON search results, topic details, direct `.torrent` downloads, magnet URI extraction, and Torznab XML feeds.

TorrGate integrates tracker scrapers for RuTracker, Kinozal, RuTor, NoNameClub, MegaPeer, BigFANGroup, NewStudio, and torrent.by through Cardigann YAML definitions.

---

## Features

- **Canonical Jackett REST v2.0 Path Space**: Exposes standard endpoints mounted under `/api/v2.0/indexers/...` for listing indexers, searching releases, and querying category metadata.
- **Torznab XML Feeds**: Emits Torznab `<caps>` XML for capabilities queries and RSS 2.0 with `<torznab:attr>` elements for searches, enabling integration with media automation managers (e.g. Sonarr, Radarr, Prowlarr).
- **Core Indexer Support**:
  - **RuTracker**: Session authentication, forum category mapping, and `windows-1251` charset transcoding.
  - **Kinozal**: Cookie-based authentication, year filtering, and detailed metadata extraction.
  - **RuTor**: Direct magnet URI extraction, publication date normalization, and UTF-8 handling.
  - **NoNameClub**: Forum search and RSS feed parsing with charset transcoding.
  - **MegaPeer**: Public Movies & TV indexer with `windows-1251` charset handling.
  - **BigFANGroup**: Public Movies & TV indexer with category filtering.
  - **NewStudio**: Public TV releases with season and episode normalization.
  - **torrent.by**: Belarusian public tracker with direct magnet URIs in search results.
- **Cardigann YAML Execution Engine**: All indexers are powered by Cardigann YAML definitions supporting Go-template expressions, Cheerio CSS selectors, session/form authentication, and filter pipelines (`dateparse`, `re_replace`, `trim`, `split`, etc.). A definition's `requestDelay` spaces every request to that tracker, including logins and session checks.
- **Outbound HTTP Proxy**: Optional forward proxy routing via `https-proxy-agent` to bypass geographic network restrictions.
- **Charset & Encoding Transcoding**: Automatic bidirectional transcoding between `windows-1251` and UTF-8 using `iconv-lite`.
- **Deployment Flexibility**: Designed for deployment as a Vercel Serverless Function or as a standalone Node.js service.
- **Interactive Documentation**: Embedded OpenAPI 3.1 specification rendered with Scalar UI at `/docs`.
- **Interactive Web Client**: Single-page web client mounted at `/` for multi-tracker search, category filtering, one-click magnet copying (built from the `.torrent` file when the tracker lists no magnet), and direct `.torrent` downloads.

---

## Getting Started

### Prerequisites

- Node.js 22+ (ESM support)
- npm

### Installation

Clone the repository and install dependencies:

```bash
git clone https://github.com/torrplay/torrgate.git
cd torrgate
npm install
```

### Running Locally

Start the development server with live reload:

```bash
npm run dev
```

To run a self-hosted production server, build once and start it from the repository root (definitions and the OpenAPI file are read from the working directory):

```bash
npm run build
```

```bash
npm start
```

The server will be available at:
- **Web Client**: `http://localhost:8443/`
- **Interactive Documentation**: `http://localhost:8443/docs`
- **API Base**: `http://localhost:8443/api/v2.0/indexers`
- **OpenAPI Specification**: `http://localhost:8443/api/v2.0/indexers/openapi.yaml`

---

## Configuration

TorrGate can be configured via environment variables or a `.env` file:

| Variable | Default | Description |
| :--- | :--- | :--- |
| `API_KEY` | *(none)* | API key for protecting indexer endpoints (via `?apikey=...`, `X-Api-Key` header, or `Authorization: Bearer`). Optional, but required in practice whenever tracker accounts are configured. A client that sends five wrong keys within a minute gets HTTP 429 until the minute is up |
| `CACHE_TTL_SECONDS` | `300` | Search and RSS cache TTL in seconds (0 to disable) |
| `HOST` | `0.0.0.0` | Bind address |
| `HTTP_PROXY` | *(none)* | Outbound HTTP proxy URL (e.g. `http://127.0.0.1:8888`) |
| `HTTPS_PROXY` | *(none)* | Outbound HTTPS proxy URL (e.g. `http://user:pass@proxy.example.com:8080`). Only `http://` and `https://` proxies are supported; HTTPS sites are tunnelled with `CONNECT` and plain-HTTP sites are forwarded as ordinary proxy requests |
| `KV_REST_API_TOKEN` | *(none)* | Upstash Redis REST token for persistent serverless cache; also holds tracker request delays across serverless instances |
| `KV_REST_API_URL` | *(none)* | Upstash Redis REST URL (e.g. `https://your-db.upstash.io`) |
| `PORT` | `8443` | Server port number |
| `REQUEST_TIMEOUT_MS` | `10000` | HTTP request timeout in milliseconds |
| `TORRGATE_<ID>_COOKIE` | *(none)* | Session cookies for semi-private trackers (e.g. `TORRGATE_SAMPLE_TRACKER_ORG_COOKIE`) |
| `TORRGATE_<ID>_PASSWORD` | *(none)* | Account password for semi-private trackers |
| `TORRGATE_<ID>_TIMEZONE` | *(`TRACKER_TIMEZONE`)* | IANA time zone in which that tracker shows release times |
| `TORRGATE_<ID>_USERNAME` | *(none)* | Account username for semi-private trackers |
| `TRACKER_TIMEZONE` | `Europe/Moscow` | IANA time zone for tracker times that carry no zone, used to turn them into exact publish dates |
| `TRUST_PROXY` | *(none; `true` on Vercel)* | Express `trust proxy` value (`true`, a hop count, or addresses such as `loopback, 10.0.0.0/8`). Set it behind a reverse proxy so failed-key throttling sees each client's real address instead of the proxy's |
| `USER_AGENT` | *(Chrome)* | Custom User-Agent header (recommended to match browser if using session cookies) |

See [.env.example](.env.example) for a pre-configured template.

### Tracker Environment Variable Derivation

Tracker-specific credentials and session cookies are derived dynamically from the tracker definition's `id` (falling back to `site` or `name`):

1. The identifier is converted to uppercase.
2. All non-alphanumeric characters (`-`, `.`, spaces) are replaced with underscores (`_`).
3. Variables follow the pattern `TORRGATE_${INDEXER_ID}_COOKIE`, `TORRGATE_${INDEXER_ID}_USERNAME`, and `TORRGATE_${INDEXER_ID}_PASSWORD`.

**Example with a made-up tracker:**
- Definition file: `definitions/sample-tracker.yml` with `id: sample-tracker.org`
- Derived provider identifier: `SAMPLE_TRACKER_ORG`
- Associated environment variables:
  - `TORRGATE_SAMPLE_TRACKER_ORG_COOKIE="session_id=...; auth_token=..."`
  - `TORRGATE_SAMPLE_TRACKER_ORG_USERNAME="sample_user"`
  - `TORRGATE_SAMPLE_TRACKER_ORG_PASSWORD="sample_password"`

> **Set `API_KEY` whenever tracker accounts are configured.** Without it, anyone who can reach the server can search and download through those accounts. TorrGate logs a warning at startup in that situation. The server listens on all interfaces (`HOST=0.0.0.0`) by default.

### Connecting Sonarr, Radarr and Prowlarr

Add TorrGate as a **Torznab** indexer (in Prowlarr: *Generic Torznab*):

- **URL:** `https://<your-host>/api/v2.0/indexers/<indexer>/results/torznab/`, where `<indexer>` is an indexer id from `GET /api/v2.0/indexers` (for example `rutor`), or `all` to search every indexer through one feed. The web client's *Connect Apps* dialog shows these URLs for your server.
- **API Path:** `/api`
- **API Key:** the value of `API_KEY`, or anything if no key is configured.
- **Categories:** a parent category such as `5000` (TV) or `2000` (Movies) matches all of its subcategories, while a subcategory such as `5040` (TV/HD) matches only tracker categories mapped to it. Many tracker categories map to the plain parent, so include `5000` for Sonarr and `2000` for Radarr alongside any subcategories. Tracker-specific categories are listed in each indexer's caps under `100000 + id`.

Errors on Torznab URLs are returned as Torznab `<error>` documents: code `100` for a missing or wrong API key, `500` when the client is temporarily blocked after repeated wrong keys, `201` for an unknown indexer or an invalid `limit`, `offset` or `page`, and `900` when the tracker could not be searched.

---

## API Endpoints

All endpoints are mounted under the canonical `/api/v2.0/indexers` path space:

### 1. List Indexers
```http
GET /api/v2.0/indexers
```
Returns an array of `JackettIndexer` objects describing registered trackers, their capabilities, and links.

### 2. Search Releases
```http
GET /api/v2.0/indexers/:indexer/results?Query=Example+Release
GET /api/v2.0/indexers/all/results?Query=Example+Release
```
Searches for releases on a specific indexer (or aggregated across all indexers), returning a `JackettSearchResponse` envelope with matching items and indexer statuses.

- `Page` selects a tracker's native zero-based result page.
- When `offset` or `limit` is present, TorrGate instead returns the requested contiguous result window across tracker pages. `limit` defaults to 100, and `Page` supplies the offset as `Page * limit` when `offset` is omitted.
- `format` filters extracted titles by the supported video resolutions `720`, `1080`, and `2160`; Cardigann definitions can also use it as `.Query.Format`.

### 3. Torznab XML Feeds
```http
GET /api/v2.0/indexers/:indexer/results/torznab/api?t=caps
GET /api/v2.0/indexers/:indexer/results/torznab/api?t=search&q=Example+Release
GET /api/v2.0/indexers/all/results/torznab/api?t=search&q=Example+Release&cat=5000,5040
```
- When `t=caps`, returns Torznab `<caps>` XML detailing supported search modes and categories.
- When `t=search`, `t=tvsearch`, or `t=movie`, returns standard RSS 2.0 XML with `<torznab:attr>` elements.
- `all` searches every indexer and merges the results into one feed.
- `offset` and `limit` select a contiguous window of results (`limit` defaults to 100, which `0` also selects). Results are ordered by tracker page: each indexer's first page, then each indexer's second page, and so on. TorrGate reads further page rounds until the window is full or the indexers are exhausted. Requests that cannot be completed within the bounded page-round budget return an upstream error instead of an incomplete window.

Categories follow the standard Torznab tree. A tracker's own categories are mapped onto it (for example a lossless music forum is reported as `3040` Audio/Lossless) and are also exposed under `100000 + tracker id`, so a client can request one tracker category exactly. `cat` accepts a comma-separated list: a parent such as `5000` matches all of its subcategories, while a subcategory such as `5040` matches only itself. Results outside the requested categories are filtered out, and a tracker that carries none of them is not queried.

### 4. Topic Details
```http
GET /api/v2.0/indexers/:indexer/details/:id
```
Returns detailed metadata for a specific topic, including description, poster URL, IMDb/Kinopoisk identifiers, and magnet URI.

### 5. Download `.torrent` File
```http
GET /api/v2.0/indexers/:indexer/download?url=<torrent-url>
```
Fetches `.torrent` files through TorrGate for trackers that require session cookies or proxy access. The file is checked to be a real torrent (a login or error page is rejected with HTTP 502), responses are limited to 32 MB, and the tracker's own file name is kept.

### 6. Magnet URI from `.torrent` File
```http
GET /api/v2.0/indexers/:indexer/magnet?url=<torrent-url>
```
Fetches the `.torrent` file the same way as the download endpoint and returns `{ "InfoHash": ..., "MagnetUri": ... }`. The info hash is the SHA-1 of the file's `info` dictionary, the release name becomes the magnet display name, and the file's announce URLs become its trackers. Files without a v1 info dictionary (v2-only torrents) are rejected with HTTP 502. The web client calls this when a result has no magnet URI of its own, only when the user asks for the magnet, since each call downloads the `.torrent` file from the tracker.

### 7. Category Mappings
```http
GET /api/v2.0/indexers/:indexer/categories
```
Returns category identifiers and names supported by the specified indexer.

---

## Project Structure

```text
api/                         # Vercel Serverless Function entrypoint
└── index.ts                 # Serverless handler exporting Express app
definitions/                 # Jackett Cardigann YAML definitions
├── bigfangroup.yml          # BigFANGroup definition (windows-1251, Movies & TV)
├── kinozal.yml              # Kinozal definition (windows-1251, cookie login)
├── megapeer.yml             # MegaPeer definition (windows-1251, Movies & TV)
├── newstudio.yml            # NewStudio definition (UTF-8, TV series)
├── noname-club.yml          # NoNaMe Club definition (windows-1251)
├── rutor.yml                # RuTor definition (UTF-8, direct magnets)
├── rutracker-ru.yml         # RuTracker.RU definition (windows-1251, session login)
└── torrentby.yml            # torrent.by definition (UTF-8, direct magnets)
src/
├── api/                     # Route handlers, controllers, views, and middleware
│   ├── controllers/         # Search, provider, RSS, download, and category controllers
│   ├── middleware/          # API key authentication and error handling
│   ├── views/               # Web client, login, and PWA view templates
│   └── routes.ts            # Canonical Jackett REST v2.0 routes
├── config/                  # Server configuration and category mappings
├── http/                    # Resilient HTTP client and charset transcoding
├── providers/               # Cardigann definition engine and ProviderRegistry
├── types/                   # TypeScript interfaces and domain models
├── utils/                   # Pure parsing utilities (date, size, peers, Torznab XML)
├── index.ts                 # Express application factory
└── server.ts                # HTTP server entry point for local and self-hosted runs
tests/                       # Comprehensive test suites mirroring src/
```

---

## Quality Verification

All quality checks are automated and enforced:

```bash
# Run unit and integration tests
npm test

# Run TypeScript typechecking
npm run typecheck

# Run ESLint
npm run lint

# Verify build output
npm run build

# Verify REUSE license and copyright compliance
npm run lint:reuse
```

---

## Releasing

Releases are driven by GitHub Actions. The workflow triggers when a GitHub Release is published and runs the full quality gate before deploying to Vercel production with `TORRGATE_VERSION` set from the tag.

```bash
# Bump version in package.json and create a git tag
npm version patch   # or minor / major
git push --follow-tags
```

Then publish a GitHub Release pointing at the new tag. The Actions workflow will run `npm test`, `npm run typecheck`, `npm run lint`, and `npm run build`, and on success deploy to Vercel with the version derived from the tag name.

Use `minor`, `major`, or an explicit semantic version in place of `patch` as needed.

---

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

Copyright (c) 2026 TorrPlay
