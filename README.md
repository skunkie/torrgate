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
  - **RuTracker.org**: A local Cardigann adaptation of Jackett's C# provider, with form and cookie authentication, Windows-1251 encoding, category mapping, and authenticated torrent downloads.
  - **RuTracker.RU**: Public searches on `rutracker.ru`, forum category mapping, and UTF-8 responses through the unchanged upstream YAML definition.
  - **Kinozal**: Cookie and form authentication, category mapping, and detailed metadata extraction.
  - **RuTor**: Direct magnet URI extraction, publication date normalization, and UTF-8 handling.
  - **NoNameClub**: Forum search and RSS feed parsing with charset transcoding.
  - **MegaPeer**: Public Movies & TV indexer with `windows-1251` charset handling.
  - **BigFANGroup**: Public Movies & TV indexer with category filtering.
  - **NewStudio**: Public TV releases with season and episode normalization.
  - **torrent.by**: Belarusian public tracker with direct magnet URIs in search results.
- **Cardigann YAML Execution Engine**: All indexers are powered by Cardigann YAML definitions supporting Go-template expressions, Cheerio CSS selectors, `post`, `get`, `form`, and `cookie` logins with session recovery, configurable definition settings, and filter pipelines (`dateparse`, `re_replace`, `trim`, `split`, etc.). A definition's `requestDelay` spaces every request to that tracker, including logins and session checks.
- **Outbound HTTP Proxy**: Optional forward proxy routing via `https-proxy-agent` to bypass geographic network restrictions.
- **Charset & Encoding Transcoding**: Automatic bidirectional transcoding between `windows-1251` and UTF-8 using `iconv-lite`.
- **Deployment Flexibility**: Designed for deployment as a Vercel Serverless Function or as a standalone Node.js service.
- **Interactive Documentation**: Embedded OpenAPI 3.1 specification rendered with Scalar UI at `/docs`.
- **Interactive Web Client**: Single-page web client mounted at `/` for multi-tracker search, category filtering, one-click magnet copying (built from the `.torrent` file when the tracker lists no magnet), and direct `.torrent` downloads.
- **Release Details**: The Info dialog displays descriptions and posters supplied by search definitions. Descriptions render as plain text, and unavailable posters are omitted.
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

TorrGate can be configured via environment variables or a `.env` file. Application settings use the `TORRGATE_` prefix; CLI flags override their corresponding environment settings:

| Variable | Default | Description |
| :--- | :--- | :--- |
| `TORRGATE_<ID>_<SETTING>` | *(definition default)* | Value of a definition setting such as `sort` or `stripcyrillic` (e.g. `TORRGATE_RUTOR_SORT=2`); see [Definition settings](#definition-settings) |
| `TORRGATE_<ID>_COOKIE` | *(none)* | Session cookies for trackers that require login (e.g. `TORRGATE_SAMPLE_TRACKER_ORG_COOKIE`) |
| `TORRGATE_<ID>_PASSWORD` | *(none)* | Account password for trackers that require login |
| `TORRGATE_<ID>_TIMEZONE` | *(`TORRGATE_TRACKER_TIMEZONE`)* | IANA time zone in which that tracker shows release times |
| `TORRGATE_<ID>_USERNAME` | *(none)* | Account username for trackers that require login |
| `TORRGATE_API_KEY` | *(none)* | API key for protecting indexer endpoints (via the `apikey`, `passkey`, or `jackett_apikey` query parameter, the `X-Api-Key` header, or `Authorization: Bearer`; browsers sign in for a session cookie instead). Optional, but required in practice whenever tracker accounts are configured. A client that sends five wrong keys within a minute gets HTTP 429 until the minute is up |
| `TORRGATE_CACHE_TTL_SECONDS` | `300` | Search and RSS cache TTL in seconds (0 to disable) |
| `TORRGATE_CORS_ORIGIN` | `*` | Allowed browser origin, such as `https://client.example`, or `*` for all origins. CLI `--corsOrigin` overrides this value |
| `TORRGATE_HOST` | `0.0.0.0` | Bind address |
| `TORRGATE_KV_REST_API_TOKEN` | *(none)* | Upstash Redis REST token for persistent serverless cache; also holds tracker request delays across serverless instances |
| `TORRGATE_KV_REST_API_URL` | *(none)* | Upstash Redis REST URL (e.g. `https://your-db.upstash.io`) |
| `TORRGATE_MAX_CONCURRENT_REQUESTS` | `10` | Positive integer limit for concurrent upstream requests shared across all trackers in each application instance. CLI `--maxConcurrentRequests` overrides this value |
| `TORRGATE_PORT` | `8443` | Server port number |
| `TORRGATE_PROXY` | *(none)* | Outbound HTTP/HTTPS proxy URL (e.g. `http://user:pass@proxy.example.com:8080`). Only `http://` and `https://` proxies are supported; HTTPS sites are tunneled with `CONNECT` and plain-HTTP sites are forwarded as ordinary proxy requests |
| `TORRGATE_REQUEST_TIMEOUT_MS` | `10000` | HTTP request timeout in milliseconds |
| `TORRGATE_TRACKER_PASSWORD` | *(none)* | Default account password, overridden by tracker-specific credentials |
| `TORRGATE_TRACKER_TIMEZONE` | `Europe/Moscow` | IANA time zone for tracker times that carry no zone, used to turn them into exact publish dates |
| `TORRGATE_TRACKER_USERNAME` | *(none)* | Default account username, overridden by tracker-specific credentials |
| `TORRGATE_TRUST_PROXY` | *(none; `true` on Vercel)* | Express `trust proxy` value (`true`, a hop count, or addresses such as `loopback, 10.0.0.0/8`). Configure it for trusted reverse proxies so failed-key throttling sees each client's real address and HTTPS sign-in responses set the Secure cookie flag. Forwarded protocol headers from untrusted clients are ignored |
| `TORRGATE_USER_AGENT` | *(Chrome)* | Custom User-Agent header (recommended to match browser if using session cookies) |
| `TORRGATE_VERSION` | *(package version)* | API version shown in the OpenAPI specification; accepts release tags such as `v1.2.3` |

Hosting and integration defaults retain their standard names: `TORRGATE_PORT` falls back to `PORT`; `TORRGATE_PROXY` falls back to `HTTPS_PROXY`, `HTTP_PROXY`, `https_proxy`, then `http_proxy`. Redis settings fall back to `KV_REST_API_TOKEN` / `KV_REST_API_URL`, then `UPSTASH_REDIS_REST_TOKEN` / `UPSTASH_REDIS_REST_URL`. Prefixed Redis values take precedence. Vercel is detected through `VERCEL`, and the API version falls back to `npm_package_version`.

See [.env.example](.env.example) for a pre-configured template. Rename unprefixed application settings to the names above; application settings require the prefix.

Browser sign-in issues a signed session cookie valid for seven days. Sign out clears the cookie from the browser. Sessions are stateless: a copied token remains valid until it expires, including after sign-out or a server restart. To invalidate existing tokens, rotate `TORRGATE_API_KEY` on every gateway instance using that key; API clients must then use the replacement key.

Failed API-key attempts on the API and sign-in form share a limit per IPv4 address or IPv6 `/64` network. IPv4-mapped IPv6 addresses use their underlying IPv4 address. Users on the same IPv6 network share the limit, so repeated failures from one device can temporarily block sign-in on another. Each application instance keeps its own count, so on serverless platforms that run several instances a client can make that many attempts against each one; choose a long, random `TORRGATE_API_KEY`.

Jackett-compatible feed and download URLs can carry API keys in query strings, which may be recorded in browser history or access logs. Redact those parameters from logs and avoid sharing keyed URLs; prefer `X-Api-Key` or Bearer authentication for direct API calls. `TORRGATE_CORS_ORIGIN` restricts browser access to cross-origin responses and complements API-key authentication; it does not protect keys appearing in URLs.

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

> **Set `TORRGATE_API_KEY` whenever tracker accounts are configured.** Without it, anyone who can reach the server can search and download through those accounts. TorrGate logs a warning at startup in that situation. The server listens on all interfaces (`TORRGATE_HOST=0.0.0.0`) by default.

When a tracker rejects a login (wrong credentials, a CAPTCHA, or a session it does not accept), TorrGate waits a minute before trying again, doubling the wait after each further failure up to 30 minutes. During this wait, operations that need a new login report the login error and the next attempt time without another login attempt. A cookie-only indexer with no usable session is unconfigured for result and caps requests. A successful sign-in resets the wait; restart the server to retry at once after correcting the credentials.

Definitions sign in with the Cardigann login method they declare: `post` submits the inputs to the login path, `get` sends them as a query string, `form` loads the login page and submits its form with the definition's inputs filled in, and `cookie` uses `TORRGATE_<ID>_COOKIE` alone.

Search result fields follow Jackett's rules: a row whose required field finds no element, attribute, or matching case is skipped, while an optional field (one marked `optional`, or one Jackett always treats as optional: `description`, `poster`, `genre`, and the `imdb`, `imdbid`, `tmdbid`, `rageid`, `tvdbid`, `tvmazeid`, `traktid`, and `doubanid` ids) whose value is blank uses its `default`, or is left out when it has none.

Selectors can declare `remove` to strip descendants from the matched element before reading it; later fields see the modified row. Field keys support `title|append` and `description|append` to concatenate text, `category|noappend` to replace accumulated categories when a mapping exists, and `|optional` to apply optional-field defaults. Fields run in declaration order, with accumulated title and description values available to later `.Result` templates. The automatic optional-field list matches the complete field key, so `description|append` needs `optional: true` or the `|optional` modifier when its selector can be absent.

### Definition Settings

A definition's `settings` (such as a sort order or title tweaks) are read from `TORRGATE_<ID>_<SETTING>`, where `<SETTING>` is the setting name in uppercase with other characters replaced by underscores. Unset or invalid values use the definition's default, and invalid values are logged at startup. Checkbox settings accept `true`/`false`, `1`/`0`, `yes`/`no`, or `on`/`off`; select settings accept one of the option keys listed in the definition. For example, `TORRGATE_RUTOR_SORT=2` asks RuTor for results by seeders, and `TORRGATE_RUTOR_ADDRUSSIANTOTITLE=true` turns on that definition's title suffix. Account settings use the `_USERNAME`, `_PASSWORD`, and `_COOKIE` variables above.

### Local Definition Overrides

Optional files in `definitions/overrides/` add or replace `search.fields` and replace BitTorrent announce-tracker lists under `trackers` in memory while imported Jackett YAML files remain unchanged. Match the base definition's filename and extension, and supply complete field declarations or tracker lists. See [the override format and behavior](definitions/overrides/README.md) for examples, evaluation order, and reload behavior.

### RuTracker.org

The `rutracker` indexer uses the local `definitions/rutracker.yml` adaptation of Jackett's C# RuTracker.org provider. The separate `rutracker-ru` indexer uses the upstream definition for the public `rutracker.ru` site.

Configure `TORRGATE_RUTRACKER_USERNAME` and `TORRGATE_RUTRACKER_PASSWORD` for form login, or `TORRGATE_RUTRACKER_COOKIE` with a browser session's Cookie header value. Sessions are checked using the logged-in user marker and renewed when the tracker rejects them. When a CAPTCHA is required, sign in in your browser and supply its session cookie; TorrGate reports the challenge and cookie setting in the error response.

The adaptation includes the C# provider's category mappings, wildcard and TV episode searches, category batches bounded to the tracker's request limit, common title normalization, topic details, and torrent downloads. Search follows the C# provider's first-page queries. Interactive CAPTCHA setup, configurable tag rearrangement, and audio reissue detection from the C# implementation are outside this YAML adaptation.

### Connecting Sonarr, Radarr and Prowlarr

Add TorrGate as a **Torznab** indexer (in Prowlarr: *Generic Torznab*):

- **URL:** `https://<your-host>/api/v2.0/indexers/<indexer>/results/torznab/`, where `<indexer>` is an indexer id from `GET /api/v2.0/indexers` (for example `rutor`), or `all` to search configured indexers through one feed. The web client's *Connect Apps* dialog shows these URLs for your server.
- **API Path:** `/api`
- **API Key:** the value of `TORRGATE_API_KEY`, or anything if no key is configured.
- **Categories:** a parent category such as `5000` (TV) or `2000` (Movies) matches all of its subcategories, while a subcategory such as `5040` (TV/HD) matches only tracker categories mapped to it. Many tracker categories map to the plain parent, so include `5000` for Sonarr and `2000` for Radarr alongside any subcategories. Described tracker categories are listed in each indexer's caps under `100000 + id` for numeric IDs; string IDs use Jackett's stable SHA-1-derived ID. Use those IDs on individual indexer feeds.

Category searches return releases matching the requested categories. As in Jackett, a release whose tracker category is not mapped has no categories: no category rules it out, so JSON searches keep it, while Torznab feeds leave it out, together with releases that have no size. An indexer whose caps advertise none of the requested category IDs, Other (`8000`) included, is not searched.

Errors on Torznab URLs are returned as Torznab `<error>` documents:

- `100`: a missing or wrong API key.
- `201`: an unknown or unconfigured indexer, an unsupported `t`, a search the indexer's caps cannot handle, an invalid `season`, `year`, `cat`, `imdbid`, or id such as `tvdbid`, or an `extended`, `limit`, or `offset` beyond 32 bits.
- `203`: `t=indexers` on a configured single indexer; a TV search by `imdbid` on an indexer whose definition does not set `allowtvsearchimdb`, or on `all`; a movie or TV search by `tmdbid` the indexer's caps do not list for that mode; or a TV search by `tvdbid` on an indexer without TV search.
- `500`: the client is temporarily blocked after repeated wrong keys.
- `900`: a single indexer's tracker could not be searched. `all` never answers with `900`; as in Jackett, it leaves failed indexers out of the feed.

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

The `send` handler receives the instance, search result, resolved magnet, and shared request helper. The `test` handler receives the instance and request helper and should use a read-only endpoint. Plugins supporting Bearer sign-in provide `getToken(instance, password, request)`, returning `accessToken` and `expiresAtMs`. The token endpoint request sets `authenticate: false` and its `contentType` to avoid recursive authentication. Plugins using a static Bearer API key declare an `api-key` authentication choice and may provide `secretPattern` to validate the key format. API keys require no username or token acquisition. All plugin requests omit cookies. Set `responseType: 'text'` for plain-text endpoints. Requests use paths relative to the instance base URL; the helper keeps them within that base path and blocks redirects. Add the plugin script to `src/web/assets.ts` before the settings UI and client bootstrap, and include it in the composed-asset and browser-script ordering checks. External script installation is outside the bundled plugin contract.

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

- JSON results expose release IDs, genres, year, file count, and book and music metadata. Missing metadata, ratio requirements, and volume factors are null; `Languages` and `Subs` are empty arrays. `CategoryDesc` joins standard category names, `Gain` is seeders times size in gigabytes without rounding, and `Peers` contains leechers and is null when seeders are absent. `MinimumSeedTime` is in seconds. An explicitly empty description stays empty. `FirstSeen` has the default date `0001-01-01T00:00:00`. `InfoHash` preserves the supplied nonblank hash or the magnet’s `xt` hash, and `Link` is null when there is no download link.
- A trailing `S01E02`, `S01`, or `E02` tag in `Query` is searched as that season and episode, as with the Torznab `season` and `ep` parameters, and leading zeros are dropped from the episode. A tag elsewhere in `Query`, or in another form such as lowercase `s01e02`, stays part of the search term.
- Each selected indexer is searched once when its caps advertise at least one requested category, or when no category is specified. Unsupported categories produce a successful empty result with zero elapsed time. Results keep the first release for each `Guid` within each indexer and are merged by publish date, newest first, preserving the original order of ties.
- Parameters bind case-insensitively, using the first value and treating whitespace-only strings as absent. `Query` is trimmed and can accompany `imdbid`; JSON preserves an explicit IMDb value as supplied. Definitions see it as `.Query.IMDBID`, with leading lowercase `t` characters removed in `.Query.IMDBIDShort`.
- Nullable IDs bind as signed 32-bit integers; invalid model-bound values are absent. When the first key spelling is exactly lowercase `tmdbid`, `tvdbid`, or `tvmazeid`, or exactly `Category[]`, the action also parses its values; invalid or blank integers there fail with status 500.
- The nullable integer IDs `doubanid`, `rageid`, `tvdbid`, `tmdbid`, `tvmazeid`, and `traktid` reach definitions. A `Query` detected as an IMDb ID takes precedence and clears the other IDs.
- The action uses the first spelling of a query key when names repeat with different casing. When that spelling is `Tracker[]`, it filters exact indexer IDs on both single and aggregate searches; repeated values and comma-separated IDs are combined. When the first spelling is `Category[]`, it accepts repeated and comma-separated category IDs. `Category` binds integer values individually.
- A `Query` that is itself an IMDb title id, `tt` followed by one to eight digits (after any trailing season and episode tag, and ignoring punctuation such as `!` or `,`), searches that id as `imdbid` does.
- Responses contain an `Indexers` status for each selected indexer, with its own elapsed time. Failed searches have status 1, zero results and elapsed time, and an error message; successful searches still contribute results. Responses containing failures are not cached.

### 3. Torznab XML Feeds
```http
GET /api/v2.0/indexers/:indexer/results/torznab/api?t=caps
GET /api/v2.0/indexers/:indexer/results/torznab/api?t=search&q=Example+Release
GET /api/v2.0/indexers/all/results/torznab/api?t=search&q=Example+Release&cat=5000,5040
```
- When `t=indexers` on `all`, returns an XML indexer list with each indexer's ID, configuration state, title, description, site link, language, type, and embedded caps. `configured=true` or `false` filters the list case-insensitively. An indexer is configured when its login requirements are supplied: definitions without login need no credentials, cookie login needs a usable session cookie, and other login methods need values for the variables their login templates emit, or a session. The JSON indexer list reports the same state. Aggregate searches and caps use configured indexers; direct result and caps requests for an unconfigured indexer return 404. A discovery request for a configured single indexer returns error 203; an unconfigured indexer returns 404 with error 201.
- When `t=caps`, returns Torznab `<caps>` XML in Jackett's layout: result limits (100, or 1000 for `all`), every search mode (`search`, `tv-search`, `movie-search`, `music-search`, `audio-search`, `book-search`) marked available or not with the parameters the indexer's definition declares, `searchEngine="raw"` for definitions that allow raw search, and the categories. As in Jackett, `tv-search` lists `imdbid` only for definitions that set `allowtvsearchimdb`, and never for `all`.
- When `t=search`, `t=tvsearch`, `t=movie`, `t=music`, or `t=book`, returns RSS 2.0 XML with `<torznab:attr>` elements in the layout of Jackett's feeds: the channel carries an atom self link to the server, the indexer's name, description, and site link (`AggregateSearch` for `all`), `en-US`, and `search`; each item lists its categories both as `<category>` elements and as attributes, links its details page in `<comments>` when it has one, and dates `<pubDate>` in UTC with a numeric offset. Items carry `<files>`, `<grabs>`, and the `rageid`, `tvdbid`, `imdb`, `imdbid`, `tmdbid`, `tvmazeid`, `traktid`, `doubanid`, `genre`, `year`, `author`, `booktitle`, `publisher`, `artist`, `album`, `label`, and `track` attributes when the indexer's definition declares the matching fields. A search mode the indexer's caps do not offer returns error 201; Cardigann definitions see the request type as `.Query.Type`.
- Torznab IMDb IDs accept the lowercase `tt` prefix or bare digits, with one to eight digits and a nonzero value. A single trailing line feed is accepted. Leading or trailing spaces and uppercase prefixes are invalid.
- `extended` is coerced like `limit` and `offset` and is passed to definitions as `.Query.Extended`, defaulting to the string `0`. `cache=false` bypasses response-cache reads and refreshes the stored response; boolean values match case-insensitively with surrounding whitespace ignored. Other values keep caching enabled. Fresh responses requested with `cache=false` use `Cache-Control: no-store`.
- Only Jackett's Torznab parameters are read: `t`, `q`, `cat`, `imdbid`, `season`, `ep`, `year`, `limit`, `offset`, `extended`, `cache`, `configured`, the ids `rid`, `tvdbid`, `tvmazeid`, `tmdbid`, `traktid`, and `doubanid`, and the music and book values `album`, `artist`, `label`, `track`, `genre`, `title`, `author`, and `publisher`.
- Definitions see `.Query.Limit` and `.Query.Offset` as decimal strings, defaulting to `0`, and `.Query.Categories` as the requested numeric category array. Category order and duplicates are preserved in `.Query.Categories` and response-cache keys. `.Categories` contains mapped tracker categories. Jackett's unused `.Query.APIKey`, `.Query.Series`, and `.Query.Movie` values are empty.
- As in Jackett, Cardigann definitions see the ids as `.Query.TVRageID`, `.Query.TVDBID`, `.Query.TVMazeID`, `.Query.TMDBID`, `.Query.TraktID`, and `.Query.DoubanID`, and the music and book values as `.Query.Album`, `.Query.Artist`, `.Query.Label`, `.Query.Track`, `.Query.Genre`, `.Query.Title`, and `.Query.Author`; a `publisher` replaces `author` in `.Query.Author`, and `.Query.Publisher` stays empty. An id that is not an integer returns error 201, and blank music and book values are ignored. Definitions also see Jackett's request flags, such as `.Query.IsTVSearch`, `.Query.IsTvdbQuery`, `.Query.IsIdSearch`, and `.Query.IsRssSearch`, as `True` or empty.
- As in Jackett, a `rid` or `tvdbid` the indexer's `tv-search` caps declare lets the indexer answer a search mode it does not otherwise offer.
- `all` searches every configured indexer whose caps can handle the request and merges the results into one feed; its caps combine those of configured indexers. When none maps a category, caps contain an empty category list. Caps use `Cache-Control: no-store` to reflect configuration changes. As in Jackett, the merged results are ordered by gain (seeders times size in gigabytes), highest first, before `limit` applies, results without a size or seeders coming last; indexers that fail, or that have not answered within 40 seconds, are left out, and the feed is not cached while any are missing.
- As in Jackett, query parameter names other than the API key are matched case-insensitively, so `Year=2024` and `year=2024` are the same request. Parameter values are not: `t` must be exactly one of the request types above. A parameter whose value is empty or only whitespace counts as absent, as Jackett binds it, so `t=%20` searches as `t=search`.
- `season` and `ep` add an episode tag to the keywords for every search type: `S01` or `S01E02`, nothing for season `0`, and a `yyyy.MM.dd` air date for a daily show's four-digit season with an `MM/dd` episode. Cardigann definitions see a positive season as `.Query.Season`, the raw `ep` as `.Query.Ep`, and the tag as `.Query.Episode`.
- `year` is added to the keywords after the search term and is visible to Cardigann definitions as `.Query.Year`, which stays empty when `year` is absent or blank; as in Jackett, `0` is passed on like any other year. Results are not filtered by year. Caps list `year` for the search modes whose definitions accept it.
- `imdbid` searches by IMDb title id, alongside any `q`. As in Jackett, a `t=movie` IMDb search needs `imdbid` in the indexer's `movie-search` caps (error 201 otherwise) and searches Movies (`2000`) when no categories are given, while a `t=tvsearch` IMDb search needs a definition that sets `allowtvsearchimdb` and returns error 203 otherwise.
- As with Jackett's Cardigann indexers, each indexer is searched once and answers from its first page. `limit` keeps each indexer's first results and then the first results of the merged feed (all of them when it is absent or `0`). Within each indexer, a result is dropped when its GUID repeats an earlier one's. As in Jackett, the GUID, emitted as each item's `<guid>` and as `Guid` in JSON results, is the tracker download link, else the magnet URI, else the details URL. This happens after the limit is applied, so a feed can hold fewer than `limit` items. An `offset` above 0 returns an empty feed for every indexer, including `all`. As in Jackett, coercion keeps digits and numeric separators: `-5` reads as 5, `1.5` as 15, and `many` as 0. If both comma and period separators appear, commas group digits and the fractional part after the period must be zero.

Cardigann definitions see the search term as `.Query.Q`; JSON searches extract a trailing episode tag, and Torznab supplies `season` and `ep` separately. `.Query.Keywords` joins the search term, the requested release year, and the episode tag with spaces, and `.Keywords` is `.Query.Keywords` after the definition's keyword filters.

Categories follow the standard Torznab tree. A tracker's own categories are mapped onto it (for example a lossless music forum is reported as `3040` Audio/Lossless). Mappings with descriptions also expose tracker-specific IDs in single-indexer caps: `100000 + tracker id` for numeric IDs, or Jackett's SHA-1-derived ID for string IDs. Request category IDs from caps; raw tracker forum IDs are unsupported. `cat` accepts a comma-separated list (as in Jackett, only the first `cat` parameter is read, and an entry that is not an integer returns error 201): a parent such as `5000` matches all of its subcategories, while a subcategory such as `5040` matches only itself. Without categories, the search is unfiltered. When categories are supplied, each indexer checks for at least one requested ID in its advertised caps. A request with no supported ID returns empty results without contacting the tracker. Mixed requests retain all requested IDs. Torznab `all` first checks its combined caps, which exclude tracker-specific IDs; JSON `all` checks the individual indexers directly. Results outside the requested categories are filtered out. As in Jackett, the feed leaves out releases with no title, no size, or no mapped category.

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

The `url` parameter accepts a literal relative or absolute URL. The legacy `path` parameter also accepts a base64url-encoded URL or root-relative path. A non-empty `url` takes precedence over `path`. These rules also apply to magnet extraction.

### 6. Magnet URI from `.torrent` File
```http
GET /api/v2.0/indexers/:indexer/magnet?url=<torrent-url>
```
Fetches the `.torrent` file the same way as the download endpoint and returns `{ "InfoHash": ..., "MagnetUri": ... }`. The info hash is the SHA-1 of the file's `info` dictionary, the release name becomes the magnet display name, and the file's announce URLs become its trackers. Files without a v1 info dictionary (v2-only torrents) are rejected with HTTP 502. The web client calls this when a result has no magnet URI of its own, only when the user asks for the magnet, since each call downloads the `.torrent` file from the tracker.

### 7. Category Mappings
```http
GET /api/v2.0/indexers/:indexer/categories
```
Returns tracker category mappings for inspection. Numeric tracker IDs are returned directly; named IDs use their mapped standard category ID, falling back to Other (`8000`) when unmapped. Use `t=caps` to obtain the category IDs accepted by searches.

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
├── overrides/               # Local field and announce-tracker overrides
├── rutor.yml                # RuTor definition (UTF-8, direct magnets)
├── rutracker-ru.yml         # RuTracker.RU definition (UTF-8, public indexer)
├── rutracker.yml            # Local adaptation of Jackett's C# RuTracker.org provider
└── torrentby.yml            # torrent.by definition (UTF-8, direct magnets)
src/
├── api/                     # HTTP routes, controllers, middleware, headers, and response caching
│   ├── controllers/         # Search, details, indexer metadata, Torznab, downloads, and categories
│   └── middleware/          # API key authentication and HTTP error handling
├── cache/                   # Cache contracts, memory and Upstash stores, configuration factory
├── config/                  # Environment and CLI configuration
├── http/                    # HTTP client, proxies, charset transcoding, concurrency and scheduling
├── jackett/                 # Query binding and wire serialization without Express dependencies
│   ├── categories/          # Standard catalog, mapping, category trees, and admission
│   ├── torznab/             # Search capabilities, query binding, discovery, and XML serialization
│   ├── manual-search-query.ts # Interactive JSON search binding
│   ├── manual-search-results.ts # Jackett JSON result and status serialization
│   ├── query.ts             # Shared Jackett model-binding primitives
│   └── types.ts             # Jackett wire models
├── providers/
│   ├── cardigann/           # Definition loading, templates, filters, extraction, and sessions
│   └── registry.ts          # Provider construction, lookup, metadata, and shared storage setup
├── search/                  # Manual and Torznab execution policies and result identities
├── types/                   # Shared provider, torrent, configuration, and API contracts
├── utils/                   # General parsing, URL handling, and authentication attempt limiting
├── web/                     # Page templates and composed browser assets
│   ├── client/              # Client bootstrap, factories, and styles
│   ├── plugins/             # Client plugin framework, adapters, and settings UI
│   ├── pwa/                 # Icons, manifest, and service worker
│   ├── shared/              # Theme and shared form assets
│   └── assets.ts            # Script and stylesheet composition
├── index.ts                 # Express application factory and configured app export
└── server.ts                # Local and self-hosted HTTP server entry point
tests/                       # Unit and integration suites mirroring source domains
├── api/                     # HTTP routes, caching, and authentication
├── cache/                   # Memory and Upstash cache behavior
├── config/                  # Configuration and lint rules
├── fixtures/                # Synthetic tracker payloads and browser storage helpers
├── http/                    # Transport, encoding, concurrency, and scheduling
├── jackett/                 # Query binding, categories, and wire serialization
├── providers/               # Provider registry and Cardigann engine behavior
│   └── cardigann/           # Definitions, extraction, encoding, and sessions
├── search/                  # Search coordination and result identity
├── utils/                   # General parsing and URL helpers
└── web/                     # Browser behavior, generated assets, styles, and PWA
```

The Cardigann engine keeps search-context construction, request encoding, field extraction, topic parsing, downloads, and login-form parsing in focused modules. `CardigannProvider` coordinates mirrors and topic-path storage; `SessionManager` owns authentication state, recovery, and retry timing.

---

See [module ownership and dependency rules](docs/architecture.md) for the boundaries between protocol behavior, search execution, providers, and browser assets.

## Quality Verification

All quality checks are automated and enforced:

CSS declarations follow RECESS ordering through `stylelint-config-recess-order`. Tests check stylesheets, embedded style blocks, and inline styles; custom properties keep their chosen order.

```bash
# Run unit and integration tests
npm test

# Run tests with coverage, as CI does
npm run coverage

# Run TypeScript typechecking
npm run typecheck

# Run ESLint and lint openapi.yaml with Redocly
npm run lint

# Lint only openapi.yaml
npm run lint:openapi

# Verify build output
npm run build

# Verify REUSE license and copyright compliance
npm run lint:reuse
```

---

## Releasing

Releases are driven by GitHub Actions. The workflow triggers when a GitHub Release is published and deploys to Vercel production with `TORRGATE_VERSION` set from the tag after verification succeeds.

```bash
# Bump version in package.json and create a git tag
npm version patch   # or minor / major
git push --follow-tags
```

Then publish a GitHub Release pointing at the new tag. The Actions workflow runs `npm test`, `npm run typecheck`, `npm run lint`, `npm run build`, and REUSE compliance checks before deploying to Vercel with the version derived from the tag name.

Use `minor`, `major`, or an explicit semantic version in place of `patch` as needed.

---

## License

TorrGate-authored TypeScript code is licensed under the [MIT License](LICENSE). Imported YAML files in `definitions/` are verbatim copies from Jackett revision `ffd509c8c`; the local `rutracker.yml` adapts its C# RuTracker.org provider. These Jackett-derived definitions retain the [GPL-2.0-only license](LICENSES/GPL-2.0-only.txt). Imported files receive copyright and license metadata through [REUSE.toml](REUSE.toml) so their contents remain unchanged.

Copyright (c) 2026 TorrPlay
