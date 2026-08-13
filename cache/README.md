# Cache

Runtime caches live here and are not committed.

`cache/wikifunctions/` is the default local Wikifunctions object cache. It stores:

- `manifest.json`: latest cached revision per ZID plus metadata.
- `objects/<ZID>/<revision>.json`: canonical ZObject payloads pinned by revision and digest.

The cache is treated as authoritative by default. Use `--refresh-cache` when you want the CLI to check current revisions before deciding whether to fetch.
