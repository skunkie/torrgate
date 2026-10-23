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
├── overrides/               # Local search.fields and announce-tracker overrides for imported definitions
├── rutor.yml                # RuTor definition (UTF-8, direct magnets, clean date parsing)
├── rutracker-ru.yml         # RuTracker.RU definition (UTF-8, public indexer, category mapping)
├── rutracker.yml            # Local RuTracker.org adaptation of Jackett's C# indexer (windows-1251, form login)
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

## Core Architectural Rules & Constraints

1. **Jackett Canonical REST v2.0 Path Space & Routing**:
   - TorrGate provides Jackett-compatible endpoints:
     - Endpoints adhere to the canonical Jackett REST v2.0 path space mounted under `/api/v2.0/indexers/...` (e.g., `/api/v2.0/indexers`, `/api/v2.0/indexers/:indexer/results`, `/api/v2.0/indexers/:indexer/results/torznab/api`).
     - JSON search responses return Jackett's envelope structure (`{ "Results": [ ... ], "Indexers": [ ... ] }` with PascalCase properties and integer byte sizes).
     - Torznab endpoints emit standard Torznab XML (`<caps>` for `t=caps`, and RSS 2.0 with `<torznab:attr>` elements for searches).
     - Short alias routes (such as `/torznab/...`) or legacy version prefixes are not used; all indexer queries, Torznab feeds, search, and downloads target the canonical `/api/v2.0/indexers/...` path space.
   - Maintain semantic consistency with Jackett and Torznab response structures while enforcing strict TypeScript interfaces.

2. **Charset & Encoding Transcoding**:
   - Several upstream trackers (Kinozal, NoNameClub) serve HTML encoded in `windows-1251`.
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
     - **Operation `parameters:` list is grouped, not sorted**: Documentation renderers (Swagger UI, Redoc, Scalar) display operation parameters in document order. That list is the order a human developer reads and must be grouped by purpose — provider/route identifiers, core query (`Query` for JSON, `q` for Torznab), filters (`Category` for JSON, `cat` and `year` for Torznab), and Torznab result controls (`offset`, `limit`). Keep related parameters together.
     - **Top-level document structure**: Top-level specification and configuration keys maintain standard conventional order (`openapi`, `info`, `servers`, `paths`, `components`).
     - **Wire format serialization**: Where declaration order *is* the wire serialization format (e.g., XML/RSS element emission order where tags must appear in a specific sequence), declaration order takes precedence. Any type or interface taking this exemption must explicitly state so in its doc comment.

8. **Jackett Definition & API Compatibility (RuTracker, Kinozal, RuTor, NoNameClub)**:
   - TorrGate maintains Jackett API and Cardigann definition compatibility for core indexers: RuTracker, Kinozal, RuTor, and NoNameClub.
   - Cardigann definitions conform to Jackett definition conventions (including site metadata, Torznab category mappings under `caps`, search request paths, inputs, error handling, CSS/text selectors, and filter pipelines).
   - YAML definitions for RuTracker, Kinozal, RuTor, and NoNameClub are compatible with Jackett indexer definitions, allowing definitions to be updated or added without bespoke scraper code.
   - Both definition parsing and emitted responses (JSON results and Torznab XML) are compatible with Jackett consumers (such as Sonarr, Radarr, Prowlarr).
   - New trackers should be addable by importing their upstream Jackett Cardigann definitions. Implement missing template, filter, authentication, and parsing behavior in the shared engine without tracker-specific branches or rewriting definitions to fit the engine.
   - Treat imported YAML files under `definitions/` as upstream assets. Preserve their declared behavior when fixing runtime issues; do not edit their selectors, filters, settings, or mappings to work around engine limitations.
   - Keep imported definitions byte-for-byte identical to their upstream files, including comments and metadata. The invented-sample-data rule applies to TorrGate-authored code, fixtures, and documentation; preserve upstream comments in imported definitions. Importing a new upstream definition is supported; refreshing existing definitions or making a local exception requires an explicit user request.
   - `definitions/rutracker.yml` is an explicitly authorized local Cardigann adaptation of Jackett's C# RuTracker.org indexer. Keep its `.org` identity and category mappings separate from the imported public `.ru` definition. Implement reusable template and session support in the shared engine, and document differences from the C# provider.
   - Optional local overrides in `definitions/overrides/` are authorized for `search.fields` additions and replacements, including verified poster selectors, and for BitTorrent announce-tracker lists under `trackers`. Match the base filename and extension, preserve imported files byte-for-byte, and cover local behavior with synthetic fixtures. Each overridden field replaces its complete base declaration; an overridden tracker list replaces the complete base list. Keep runtime compatibility fixes in the shared engine, and prefer contributing additions upstream so local overrides can be removed.

9. **Module Ownership & Dependencies**:
   - Keep HTTP request/response handling in `src/api/`, Jackett protocol behavior in `src/jackett/`, search coordination in `src/search/`, and browser assets in `src/web/`.
   - Expose category mappings and capability metadata through the provider contract; generic search and serialization must not inspect concrete Cardigann definitions.
   - Keep Cardigann-specific loading, templates, filters, extraction, and session behavior under `src/providers/cardigann/`.
   - Browser factories receive dependencies explicitly through the client bootstrap. Preserve script initialization order and the CSS cascade in `src/web/assets.ts` and client asset composition.
   - Keep tests aligned with source ownership, including source-scanning checks for inline styles and page metadata. ESLint enforces the protocol, search, provider, and web import boundaries.

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
- Order CSS declarations in stylesheets, embedded `<style>` blocks, and inline styles using RECESS (`stylelint-config-recess-order`). Place shorthands before their longhands; custom properties keep the order that reads best. The CSS ordering tests enforce the shared Stylelint configuration.

## Code Comments & Documentation

- Use American English spelling and usage consistently in documentation, prose, and code comments (e.g., "behavior", "color", "normalize", and "serialize"). Preserve proper names, quoted text, external API identifiers, and intentionally non-English sample data.
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
- **Linting** (ESLint, plus Redocly for `openapi.yaml`; `npm run lint:openapi` runs Redocly alone):
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
