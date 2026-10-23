<!--
SPDX-FileCopyrightText: 2026 TorrPlay

SPDX-License-Identifier: MIT
-->

# Module ownership

`src/index.ts` composes the Express application. `src/api/` owns routes, authentication, HTTP errors, request cancellation, response headers, and response caching. Controllers restore cached topic paths before returning cached searches.

`src/jackett/` owns protocol behavior: query binding, standard and custom categories, capability checks, JSON wire models, and Torznab serialization. Its functions accept shared contracts and values rather than Express requests or concrete providers. Manual and Torznab binders preserve their distinct validation order and parameter semantics.

`src/search/` coordinates provider calls. Manual search reports individual indexer outcomes and deduplicates within each indexer. Torznab coordination applies its own limit, ordering, and deadline policies. Both use provider category metadata and isolate mutable search options between calls.

`src/providers/registry.ts` loads and registers providers, resolves their IDs, and configures shared storage and request scheduling. Metadata consumers use the provider contract. Registry initialization may configure capabilities specific to Cardigann providers.

`src/providers/cardigann/` implements the definition engine. Search context and request construction, field extraction, topic parsing, downloads, cookie parsing, and login-form parsing have separate modules. The provider coordinates mirrors and topic-path storage. The session manager keeps authentication state, recovery promises, and retry timing together.

`src/web/` owns page templates and generated browser assets. `assets.ts` composes plugins before their settings UI and the client bootstrap. Client factories receive their dependencies explicitly and share application state through the bootstrap. Browser factories are checked independently for unresolved references. Stylesheet sections retain their composition order to preserve the cascade.

PWA icon generation, manifest generation, and service-worker generation live under `src/web/pwa/`. Assets remain TypeScript-exported strings and buffers served by the API routes, so local builds and Vercel use the same delivery path.

`src/http/`, `src/cache/`, and `src/config/` own upstream transport, storage, and environment/CLI configuration. `src/types/` contains shared provider, torrent, configuration, and API contracts. General parsers and URL helpers remain under `src/utils/`.

# Dependency rules

ESLint enforces these boundaries:

- Jackett protocol modules cannot import API, provider implementation, or web modules.
- Search coordination cannot import API, Cardigann implementation, or web modules.
- Cardigann execution cannot import API or web modules.
- Web assets cannot import API or provider implementation modules.

Shared types may describe protocol capabilities. Protocol serializers may use shared search outcome types and the result-identity helpers. These dependencies keep wire formatting and search execution separate without duplicating their contracts.

# Tests and changes

Tests mirror source domains. Indexer routes, authentication, and response caching are tested under `tests/api/`. Browser behavior, generated assets, and HTTP delivery of web assets are tested under `tests/web/`. Synthetic tracker payloads and shared canned values belong under `tests/fixtures/`.

When moving modules, update imports, source-scanning checks, the documented directory trees, and deployment file discovery. Verify public response behavior and emitted browser assets, as well as TypeScript compilation. Imported tracker definitions remain upstream assets, with local overrides applied by the definition loader.
