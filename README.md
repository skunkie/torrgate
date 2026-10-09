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
- **Client Plugins**: Browser integrations with configurable instances, including sending magnets to TorrPlay and qBittorrent.

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
| `CORS_ORIGIN` | `*` | Allowed browser origin, such as `https://client.example`, or `*` for all origins. CLI `--corsOrigin` overrides this value |
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
| `TRUST_PROXY` | *(none; `true` on Vercel)* | Express `trust proxy` value (`true`, a hop count, or addresses such as `loopback, 10.0.0.0/8`). Configure it for trusted reverse proxies so failed-key throttling sees each client's real address and HTTPS sign-in responses set the Secure cookie flag. Forwarded protocol headers from untrusted clients are ignored |
| `USER_AGENT` | *(Chrome)* | Custom User-Agent header (recommended to match browser if using session cookies) |

See [.env.example](.env.example) for a pre-configured template.

Browser sign-in issues a signed session cookie valid for seven days. Sign out clears the cookie from the browser. Sessions are stateless: a copied token remains valid until it expires, including after sign-out or a server restart. To invalidate existing tokens, rotate `API_KEY` on every gateway instance using that key; API clients must then use the replacement key.

Jackett-compatible feed and download URLs can carry API keys in query strings, which may be recorded in browser history or access logs. Redact those parameters from logs and avoid sharing keyed URLs; prefer `X-Api-Key` or Bearer authentication for direct API calls. `CORS_ORIGIN` restricts browser access to cross-origin responses and complements API-key authentication; it does not protect keys appearing in URLs.

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

### Sending releases to TorrPlay

Open **Plugins** in the web client, enable **TorrPlay**, and add a named instance. Enter the instance’s base URL, including any reverse-proxy path prefix, and choose authentication and torrent storage. Use **Test connection** before saving. Add more instances to send to different instances; plugins and individual instances can be disabled independently.

**Send to TorrPlay** appears on search results and in release details when the plugin is enabled and a magnet can be obtained. A single enabled instance receives the release directly; multiple instances open a picker. TorrGate uses the result's magnet or calls its authenticated `/api/v2.0/indexers/:indexer/magnet` endpoint to download and parse the `.torrent` file, then posts the magnet and title to the selected TorrPlay instance's `/api/v1/torrents` endpoint. Already-added torrents are reported separately from new additions.

Instance settings, usernames, passwords, and acquired Bearer tokens are stored in this browser's local storage and restored after reloading or reopening the page. Changes synchronize across open tabs; an IndexedDB transaction coordinates local-storage writes so concurrent updates preserve removals and credential changes. If browser storage or coordination is unavailable, settings remain in memory until reload and the client reports that they were not saved. Edit an instance to enter credentials; leaving the password blank keeps saved credentials when the destination and authentication settings match. Removing an instance or changing its destination clears its saved credentials and token. Connection tests use draft credentials without saving them.

For **Bearer sign-in**, enter the TorrPlay username and password. **Save & get token** obtains an access token immediately; saving alone obtains one automatically on the first request. TorrGate requests tokens from TorrPlay's `/oauth/token` endpoint using the password grant. Before each API request, it reuses the cached token if more than a minute remains, otherwise acquires a new token with the saved credentials. Concurrent requests share token acquisition. Tokens renew on demand, including after reopening the page; there is no background polling. An authentication rejection clears the cached token so the next attempt signs in again. TorrPlay does not issue refresh tokens.

Requests go directly from the browser to TorrPlay. In TorrPlay's settings, add the TorrGate origin to **CORS allowed origins** (`cors_allowed_origins`), for example `https://gate.example.com` or `http://gateway.example:3000`. An origin includes the scheme, hostname, and port; it has no path. TorrPlay already trusts loopback origins. CORS permission and TorrPlay authentication are both required when authentication is enabled.

The web client's Content Security Policy permits HTTP and HTTPS connections for configured integrations while loading scripts from its own origin. For an HTTP TorrPlay instance on your LAN, choose **Local network** under **Instance location**; for an instance running on the browser's computer, choose **This computer (localhost)**. These settings declare the destination address space on connection tests, token requests, and torrent additions. Supporting browsers can then request local-network permission and permit the HTTP connection from an HTTPS gateway. Allow that permission and configure TorrPlay CORS as described above. **Automatic** leaves address-space detection to the browser. Public HTTP instances and browsers without this permission feature require an HTTPS TorrPlay endpoint when the gateway uses HTTPS. See [browser local-network access](https://developer.mozilla.org/en-US/docs/Web/API/Request/targetAddressSpace). Connection errors suggest checking permissions, the URL, CORS, and HTTPS; JavaScript cannot reliably distinguish these failures.

### Sending releases to qBittorrent

Enable **qBittorrent** in **Plugins** and add an instance with its base URL and **API key**. The integration requires qBittorrent **5.2 or newer**. Generate a key in qBittorrent **Preferences → Web UI → API Key**. Requests send the key as `Authorization: Bearer <API_KEY>` and omit cookies. Rotating the key invalidates the previous key; edit the instance to save its replacement. See [qBittorrent API-key authentication](https://github.com/qbittorrent/qBittorrent/wiki/API-Key-Authentication-%28%E2%89%A5v5.2.0%29).

Set an optional download folder, category, and comma-separated tags, then choose whether downloads start automatically. Empty optional fields use the instance defaults. Choosing a download folder uses manual torrent management so the selected path is honored. **Test connection** reads the application version using the API key. **Send to qBittorrent** uses the same magnet resolution and instance picker as TorrPlay, then submits a form to `/api/v2/torrents/add` with `stopped` matching the automatic-start choice. Success requires an `Ok.` response; rejected magnets and authentication failures are reported without retrying the addition.

A direct cross-origin URL works when it allows the TorrGate origin, the `Authorization` and `Content-Type` headers, and `GET`, `POST`, and `OPTIONS` requests. It must answer CORS preflight requests without requiring the API key, since browsers omit it from preflight. If the endpoint does not provide this CORS handling, configure a reverse proxy to supply it. Keep qBittorrent's Host validation enabled and forward a Host header it accepts. qBittorrent's API-key requests bypass its cookie-related CSRF checks, while browser CORS and mixed-content restrictions still apply. For an HTTP instance on your LAN, choose **Local network** and allow browser local-network access; browsers without this permission feature need HTTPS.

A proxy path on TorrGate's origin, such as `https://gate.example.com/qbittorrent`, also works and avoids cross-origin CORS setup. The proxy must strip the path prefix and run where it can reach qBittorrent. TorrGate's API does not relay plugin requests.

### Adding a bundled client plugin

Client plugins are bundled browser scripts registered with `window.torrGatePlugins.register`. A plugin declares `id`, `name`, `actionLabel`, `canHandle`, configuration `fields`, `send`, and `test`. Each configuration field declares an `id`, `label`, and `defaultValue`. Choice fields provide `choices` containing labels and values; text fields set `type` to `text` and may provide a `placeholder`. Plugins may declare `authTypes` containing supported labels and values; the settings form shows those choices for the selected plugin. The shared framework handles instance persistence, authentication, request timeouts, and duplicate sends. The settings UI renders plugin fields and actions without tracker-specific changes.

The `send` handler receives the instance, search result, resolved magnet, and shared request helper. The `test` handler receives the instance and request helper and should use a read-only endpoint. Plugins supporting Bearer sign-in provide `getToken(instance, password, request)`, returning `accessToken` and `expiresAtMs`. The token endpoint request sets `authenticate: false` and its `contentType` to avoid recursive authentication. Plugins using a static Bearer API key declare an `api-key` authentication choice and may provide `secretPattern` to validate the key format. API keys require no username or token acquisition. All plugin requests omit cookies. Set `responseType: 'text'` for plain-text endpoints. Requests use paths relative to the instance base URL; the helper keeps them within that base path and blocks redirects. Add the plugin script to the web-client asset composition before the settings and web-client scripts, and include it in the browser-script ordering checks. External script installation is outside the bundled plugin contract.

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

Download URLs and every redirect must match a configured mirror's scheme and port. The mirror hostname and its download subdomains are accepted. HTTP downloads require an explicitly configured HTTP mirror.

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
│   ├── asset-routes.ts       # PWA, icons, stylesheets, and browser scripts
│   ├── auth-routes.ts        # Sign-in and sign-out
│   ├── page-routes.ts        # Web client and API documentation
│   └── routes.ts            # Canonical Jackett REST v2.0 routes
├── cache/                   # Cache contracts, memory and Upstash stores, configuration factory
├── config/                  # Server configuration and category mappings
├── http/                    # HTTP client, charset transcoding, concurrency and request scheduling
├── providers/               # Cardigann execution, result extraction, sessions, and ProviderRegistry
├── types/                   # TypeScript interfaces and domain models
├── utils/                   # Parsing, Torznab serialization, and failed authentication attempt limiting
├── index.ts                 # Express application factory
└── server.ts                # HTTP server entry point for local and self-hosted runs
tests/                       # Comprehensive test suites mirroring src/
```

---

## Quality Verification

All quality checks are automated and enforced:

CSS declarations follow RECESS ordering through `stylelint-config-recess-order`. Tests check stylesheets, embedded style blocks, and inline styles; custom properties keep their chosen order.

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
