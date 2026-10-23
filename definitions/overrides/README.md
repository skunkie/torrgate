<!--
SPDX-FileCopyrightText: 2026 TorrPlay

SPDX-License-Identifier: MIT
-->

# Local definition overrides

Place an optional YAML file here with exactly the same filename and extension as
its base definition. For example, `sample-tracker.yml` applies to
`definitions/sample-tracker.yml`, regardless of the definition's `id`.

Overrides support `search.fields` additions and replacements:

```yaml
search:
  fields:
    poster:
      attribute: src
      selector: img.release-poster
```

Use selectors verified against the tracker's search HTML. Each supplied field
replaces the complete base field, including its filters. Existing fields retain
their evaluation order; new fields are appended in override declaration order.
Fields can use the shared Cardigann template and filter engine.
Supported field properties are `attribute`, `case`, `default`, `filters`,
`optional`, `remove`, `selector`, and `text`. `remove` strips descendants from the
selected element before extraction. `default` supplies a template when an optional
field is blank. Field names support modifiers such as `title|append`,
`description|append`, `category|noappend`, and `size|optional`; new declarations run
after existing fields, so appended values can use earlier `.Result` values.

Overrides can also supply a complete BitTorrent announce-tracker list, either on
its own or alongside `search.fields`:

```yaml
trackers:
  - https://tracker.example.test/announce
  - udp://tracker.example.test:6969/announce
```

The list replaces the base `trackers` list; `trackers: []` clears it. These are
announce URLs used by the shared engine to construct magnets from info hashes or
supplement scraped magnets without announce URLs. Magnets that already contain
announce URLs retain them. The list does not change the tracker's website mirrors.

The Kinozal, NoNaMe Club, RuTor, and RuTracker.org overrides supply their announce
lists. RuTracker.org's list belongs to `rutracker.yml`; `rutracker-ru.yml` remains the separate public indexer.

The loader applies overrides in memory when providers are created. Restart the
application after changing an override. Removing the file restores the base
definition. Malformed YAML, unsupported keys, or incorrect value types produce a
warning and leave the base provider available. Selectors, templates, and filters
execute through the shared engine; verify their behavior with synthetic fixtures.
Override files without a matching base filename are ignored.

Keep imported Jackett files unchanged. Prefer contributing additions upstream,
then remove a local override when the imported definition supplies the same
behavior. Runtime compatibility fixes belong in the shared engine.
