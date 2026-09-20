<!--
SPDX-FileCopyrightText: 2026 TorrPlay

SPDX-License-Identifier: MIT
-->

# Repository Agent Instructions

## Project Goal & Overview

TorrGate is a high-performance, modular TypeScript API gateway and proxy for torrent trackers. It provides Jackett-compatible API endpoints (canonical paths, JSON response structures, and Torznab XML feeds), powered by Cardigann YAML definitions and modular tracker providers for RuTracker, Kinozal, RuTor, NoNameClub, MegaPeer, BigFANGroup, NewStudio, and torrent.by.

TorrGate exposes a unified API adhering to the canonical Jackett REST v2.0 path space (`/api/v2.0/indexers/...`), providing structured search results, topic details, direct `.torrent` downloads, magnet URI extraction, and Torznab feeds. It is authored in modern TypeScript (ESM), enforces strict linting and typechecking rules, and maintains comprehensive unit and integration tests using Node's native test runner.

## Repository Structure & Module Organization

The codebase is organized into domain-driven modules under `src/` and mirrored under `tests/`:

```text
api/                         # Vercel Serverless Function entrypoint
└── index.ts                 # Serverless handler exporting the Express application
definitions/                 # Jackett Cardigann YAML definitions
├── bigfangroup.yml          # BigFANGroup definition (windows-1251, Movies & TV)
├── kinozal.yml              # Kinozal definition (windows-1251, cookie login, category mapping)
├── megapeer.yml             # MegaPeer definition (windows-1251, Movies & TV)
├── newstudio.yml            # NewStudio definition (UTF-8, TV series)
├── noname-club.yml          # NoNaMe Club definition (windows-1251, category mapping)
├── rutor.yml                # RuTor definition (UTF-8, direct magnets, clean date parsing)
├── rutracker-ru.yml         # RuTracker.RU definition (windows-1251, form login, category mapping)
└── torrentby.yml            # torrent.by definition (UTF-8, direct magnets)
src/
├── api/                     # Route handlers, controllers, views, and middleware
│   ├── controllers/         # Search, provider, RSS, download, and category controllers
│   ├── middleware/          # API key authentication and error handling
│   ├── views/               # Web client, login, and PWA view templates
│   ├── async-handler.ts     # Routes rejected async handlers to the error middleware
│   ├── cache-headers.ts     # Cache-Control policy for search and feed responses
│   ├── routes.ts            # Canonical Jackett REST v2.0 routes (/api/v2.0/indexers/)
│   └── torznab-errors.ts    # Torznab <error> responses for Torznab endpoints
├── config/                  # Configuration, environment variables, proxy settings
├── http/                    # HTTP client, proxy agents (HttpProxyAgent, HttpsProxyAgent), charset transcoding (iconv-lite)
├── providers/               # Tracker provider registry and Cardigann definition engine
│   ├── cardigann-provider.ts # Cardigann definition execution engine
│   ├── filters.ts           # Cardigann filter pipeline (trim, dateparse, re_replace, etc.)
│   ├── loader.ts            # Definition file loader from definitions/
│   ├── registry.ts          # Central ProviderRegistry managing dynamic indexer providers
│   ├── result-window.ts     # Offset/limit result windows across paged indexer searches
│   ├── session-manager.ts   # Tracker authentication and cookie jar manager
│   ├── template.ts          # Go-template evaluator
│   └── types.ts             # Cardigann definition and template types
├── types/                   # Domain models, provider interfaces, and API schemas (alphabetically sorted)
│   ├── api.ts               # Request/response schemas, error responses
│   ├── config.ts            # Server and proxy configuration types
│   ├── jackett.ts           # Jackett wire format models (search results, indexer caps, envelopes)
│   ├── provider.ts          # Provider interfaces, capabilities, status
│   └── torrent.ts           # Torrent item, topic details, and category types
├── utils/                   # Resilient parsing (date, size, peers), Torznab categories and XML, caching, rate limiting
├── index.ts                 # Express application factory and configured app export
└── server.ts                # HTTP server entry point for local and self-hosted runs
tests/
├── api/                     # Controller, routing, auth, caching, and Vercel entrypoint integration tests
├── config/                  # Category and configuration tests
├── fixtures/                # Synthetic tracker HTML, XML, and JSON responses (invented sample data only)
├── providers/               # Cardigann template, filter, loader, provider, encoding, and session tests
└── utils/                   # Parsing, category mapping, cache, rate limiter, and Torznab XML tests
```

## Core Architectural Rules & Constraints

1. **Jackett Canonical REST v2.0 Path Space & Routing**:
   - TorrGate provides Jackett-compatible endpoints:
     - Endpoints adhere to the canonical Jackett REST v2.0 path space mounted under `/api/v2.0/indexers/...` (e.g., `/api/v2.0/indexers`, `/api/v2.0/indexers/:indexer/results`, `/api/v2.0/indexers/:indexer/results/torznab/api`).
     - JSON search responses return Jackett's envelope structure (`{ "Results": [ ... ], "Indexers": [ ... ] }` with PascalCase properties and integer byte sizes).
     - Torznab endpoints emit standard Torznab XML (`<caps>` for `t=caps`, and RSS 2.0 with `<torznab:attr>` elements for searches).
     - Short alias routes (such as `/torznab/...`) or legacy version prefixes are not used; all indexer queries, Torznab feeds, search, and downloads target the canonical `/api/v2.0/indexers/...` path space.
   - Maintain semantic consistency with Jackett and Torznab response structures while enforcing strict TypeScript interfaces.

2. **Charset & Encoding Transcoding**:
   - Several upstream trackers (RuTracker, Kinozal) serve HTML encoded in `windows-1251`.
   - Outgoing request parameters and form bodies must be transcoded from UTF-8 to the target tracker's character set before transmission.
   - Incoming binary responses must be decoded to UTF-8 using `iconv-lite` before HTML parsing (`cheerio`) or string inspection.
   - All responses emitted by TorrGate must strictly be valid UTF-8 JSON or XML. Mojibake is strictly unacceptable.

3. **Resilient Data Parsing**:
   - Upstream trackers format dates ("14 Авг 24", "Wed, 14 Aug 2024 11:57:36 +0300", "02.01.2006"), file sizes ("10.33 GB", "512 MB", "1234567"), and peer counts ("1,234", "0") inconsistently.
   - Parsing utilities must be resilient to whitespace, locale differences, and non-standard number separators (both `,` and `.` as digit grouping or decimal points).
   - Never throw unhandled exceptions on unexpected scraper output; return safe defaults (e.g., 0 for unparseable seeders, empty string or null for missing dates) and log warnings appropriately.

4. **Invented Sample Data, Never Real Works**:
   - Sample titles in code, tests, fixtures, and documentation must be made up — "Example Release", "Sample Show S01E02", "Test Artist" — not the names of real films, series, albums, books, or the people who made them.
   - TorrGate indexes and scrapes torrent trackers, so a fixture naming a real, in-copyright work reads as a reference to a specific pirated release rather than neutral test data.
   - Non-ASCII coverage still matters: invent non-ASCII sample titles rather than dropping coverage (e.g., "Тестовый Релиз", "Пример Фильма").
   - Real software, protocols, and provider names (RuTracker, Kinozal, RuTor, NoNameClub, Express, Cheerio) are expected and not sample data.

5. **Test Terminology Standards**:
   - Use precise testing terms across tests, fixtures, and helpers:
     - **`sample`**: A fed-in value, where it needs separating from the result it produces or from a real value alongside it (`sampleDateString`).
     - **`test...` / `fixture`**: Canned payloads, HTML snippets, and static response files (`testHtml`, `rutrackerFixture`).
     - **`testServer`**: A mock HTTP server serving canned responses.
     - **`stub`**: An implementation of an interface returning fixed answers without recording or asserting.
     - **`fake`**: Reserved exclusively for an in-memory, working implementation of an interface (e.g., in-memory cache or store).
     - **`mock`**: Reserved exclusively for objects pre-programmed with call expectations that verify method invocations.

6. **Proxy & Session Management**:
   - Outbound requests must support optional HTTP/HTTPS forward proxy configuration (`https-proxy-agent`) via CLI arguments or environment variables to bypass geographic restrictions.
   - Session cookies required for topic inspection or file list retrieval (such as RuTracker `bb_session` or Kinozal `uid`/`pass`) must be handled securely through configuration, never hardcoded in source code or committed to git.

7. **Alphabetical Property, Schema & Field Ordering**:
   - **Interfaces, Types, and Object Literals**: Sort interface property declarations, type literal members, class fields, and named properties in composite object literals alphabetically by key name (case-sensitive, plain byte order).
     - These are lookup structures and API contracts — nobody reads an interface top-to-bottom. Alphabetical ordering makes properties immediately findable, determines unambiguously where a new field belongs, and prevents noisy git diffs and merge conflicts.
   - **OpenAPI & Schema Ordering**:
     - `paths`, `components` sections (schemas, responses, parameters), entries within each section, and each schema's `properties` must be sorted alphabetically.
     - Each schema's `required` array must be sorted alphabetically matching its properties.
   - **Exemptions**:
     - **Operation `parameters:` list is grouped, not sorted**: Documentation renderers (Swagger UI, Redoc, Scalar) display operation parameters in document order. That list is the order a human developer reads and must be grouped by purpose — provider/route identifiers, core query (`query`), filters (`category`, `year`), and pagination (`page`, `limit`). Sorting alphabetically scatters related pairs (e.g. `page` away from `limit`).
     - **Top-level document structure**: Top-level specification and configuration keys maintain standard conventional order (`openapi`, `info`, `servers`, `paths`, `components`).
     - **Wire format serialization**: Where declaration order *is* the wire serialization format (e.g., XML/RSS element emission order where tags must appear in a specific sequence), declaration order takes precedence. Any type or interface taking this exemption must explicitly state so in its doc comment.

8. **Jackett Definition & API Compatibility (RuTracker, Kinozal, RuTor, NoNameClub)**:
   - TorrGate maintains Jackett API and Cardigann definition compatibility for core indexers: RuTracker, Kinozal, RuTor, and NoNameClub.
   - Cardigann definitions conform to Jackett definition conventions (including site metadata, Torznab category mappings under `caps`, search request paths, inputs, error handling, CSS/text selectors, and filter pipelines).
   - YAML definitions for RuTracker, Kinozal, RuTor, and NoNameClub are compatible with Jackett indexer definitions, allowing definitions to be updated or added without bespoke scraper code.
   - Both definition parsing and emitted responses (JSON results and Torznab XML) are compatible with Jackett consumers (such as Sonarr, Radarr, Prowlarr).

## Commit Messages & History Hygiene


- **Conventional Commits**: Use `type(scope): concise imperative summary`.
  - Common types: `feat`, `fix`, `refactor`, `docs`, `test`, `chore`, `style`, `ci`.
  - Common scopes: `api`, `providers`, `http`, `config`, `types`, `test`, `docs`, `build`.
- **Subject Formatting**: Keep the subject concise, lowercase after the colon, and without a trailing period.
- **Specific Scopes**: Use a specific package or subsystem as the scope when appropriate (e.g., `feat(providers): add rutor date parser`). Omit the scope for genuinely cross-cutting changes (`test: add synthetic tracker fixtures`).
- **Atomic Commits**: Treat one cohesive change and its supporting refactors and tests as one commit. Split changes only when they are independently meaningful and leave the repository correct at each boundary.
- **Body Requirements**: For a non-trivial commit, add a body after a blank line and use `-` bullets. Write each bullet as a complete sentence ending with a period.
- **Content Focus**: Use body bullets to describe observable behavior, important implementation or safety details, and relevant test coverage. Do not narrate file-by-file edits.
- **Timestamp Symmetry**: When rebasing, amending, or squashing commits, ensure `GIT_COMMITTER_DATE` matches `GIT_AUTHOR_DATE`.
- **Atomic Buildability**: Ensure every commit compiles and verifies cleanly: `npm test`, `npm run typecheck`, and `npm run lint`.

Example:

```text
feat(providers): add resilient date parser for rutor listings

- Parse Russian month abbreviations into ISO-compatible date strings.
- Handle relative date expressions without throwing on missing time fields.
- Add unit test coverage using synthetic fixture strings.
```

## Naming & Code Style Conventions

- **Industry-Standard Terminology & Types**:
  - Adhere strictly to industry-standard BitTorrent, HTTP/REST, and indexer terminology (e.g., `infoHash`, `magnetUri`, `seeders`, `leechers`, `peers`, `tracker`, `provider`, `category`). Never invent bespoke synonyms or idiosyncratic aliases for established concepts.
  - Model domain entities with strong, idiomatic TypeScript types: avoid `any` or loose `object` escapes; use discriminated unions, semantic type aliases (e.g., `InfoHash`, `TorrentId`), and standard runtime/web types (`URL`, `Buffer`, `AbortSignal`).
  - Align API models, response schemas, and query parameters with established industry specifications (such as OpenAPI 3.1, Torznab, and Jackett conventions) rather than ad-hoc shapes.
- Follow standard TypeScript naming conventions consistently:
  - Use PascalCase for classes, interfaces, type aliases, and enums.
  - Use `camelCase` for functions, methods, variables, parameters, and internal object properties.
  - Use `UPPER_SNAKE_CASE` only for immutable module-level constants.
  - Use `kebab-case` for source and test filenames.
- Choose clear, descriptive names based on domain behavior. Avoid ambiguous abbreviations, single-letter identifiers outside small conventional scopes, Hungarian notation, and names that repeat obvious type information.
- Name booleans with predicates such as `is`, `has`, `can`, `should`, or `needs`.
- Treat acronyms as words in identifiers (`CardigannProvider`, `httpClient`, `torrGateApi`) while preserving their conventional uppercase spelling in user-facing prose (`API`, `URL`, `HTTP`).
- Include units when a numeric value would otherwise be ambiguous, such as `timeoutMs`, `sizeBytes`, or `portNumber`.
- Preserve field names defined by external APIs and wire formats when interfacing with upstream trackers. Map explicitly at the boundary to idiomatic TypeScript types.

## Code Comments & Documentation

- Default to no comments. Only add one when the *why* is genuinely non-obvious: a hidden constraint, a subtle invariant, or behavior that would otherwise surprise a reader.
- **A declaration's explanation goes above it, not inside it**: a comment that explains what a function, type, or test is for belongs on the line before `function`, `class`, or `interface` as its doc comment; a comment inside the body belongs to the statement it sits above.
- Do not narrate bug history in comments — no references to a specific error message, a prior regression, "this used to crash", or how an issue was found and fixed. That narrative belongs in the commit message, not the source.
- Rely on regression tests, not comments, to prevent a fixed bug from resurfacing.
- Make a comment's explanation self-contained rather than pointing to `AGENTS.md` or another external doc for the reason.
- Other project documentation (`README.md`, `docs/*.md`) must explain things in its own words rather than citing `AGENTS.md` or a specific rule number by name.
- **No hardcoded counts or measured results in documentation**: do not write figures that were true when measured (number of tests, benchmark timings, file counts, coverage percentages). State the standard the code is held to instead.
- Describe behavior in terms of what it does, not what it used to do or doesn't do relative to some other design.

## Testing & Quality Standards

- **Mandatory Test Coverage**:
  - Every new feature, bugfix, refactor, or scraper update must be covered with unit tests under `tests/`.
  - Test the intended current behavior. Do not add assertions whose only purpose is to prove that a superseded implementation detail or previous behavior is absent. Negative assertions remain appropriate when the absence itself is a current contract or security invariant.
  - Maintain comprehensive coverage for:
    - **HTTP Client**: Proxy configuration, timeout handling, error mapping, and charset transcoding.
    - **Providers**: Extraction of titles, details URLs, torrent links, magnets, seeders, leechers, and dates from synthetic HTML and XML fixtures.
    - **API Routes**: Endpoint routing, query parameter validation, pagination, and JSON response formatting.
    - **Parsing Utilities**: Resilient date, size, and peer count parsing edge cases.
- **Test Runner**:
  - Tests are written with Node's native test runner (`node:test` and `node:assert/strict`) executed through `tsx`:
    ```bash
    npm test
    ```
- **Documentation Name Check**:
  - When a change renames, removes, or unexports a symbol, confirm the docs do not still name it. Run the documentation name checker to verify backticked identifiers in `AGENTS.md` and `README.md` match actual code symbols:
    ```bash
    python3 - <<'EOF'
    import pathlib, re
    files = [pathlib.Path("AGENTS.md"), pathlib.Path("README.md"), *sorted(pathlib.Path("docs").glob("*.md"))]
    docs = "".join(f.read_text() for f in files if f.exists())
    token = re.compile(r"\"(?:\\.|[^\"\\\n])*\"|`[^`]*`|'(?:\\.|[^'\\\n])*'|//[^\n]*|/\*.*?\*/", re.S)
    def strip(path):
        return token.sub(lambda m: "" if m.group()[0] == "/" else m.group(), path.read_text())
    code = "".join(strip(p) for p in pathlib.Path("src").rglob("*.ts"))
    names = {n for n in re.findall(r"`([A-Z]\w*(?:\.\w+)?)`", docs) if not n.isupper()}
    stale = sorted(n for n in names if n.split(".")[-1] not in code)
    print("\n".join(stale) or "docs name no missing identifiers")
    EOF
    ```

## Quality Verification & Commands

Before committing any changes, all checks must pass cleanly without warnings or errors:

- **Unit Testing**:
  ```bash
  npm test
  ```
- **Test Coverage**:
  ```bash
  npm run coverage
  ```
- **Type Checking**:
  ```bash
  npm run typecheck
  ```
- **Linting**:
  ```bash
  npm run lint
  ```
  Auto-fix formatting and lint issues where possible:
  ```bash
  npm run lint:fix
  ```
- **Build Verification**:
  ```bash
  npm run build
  ```
- **License & Copyright Compliance (REUSE)**:
  ```bash
  reuse lint
  ```
