# Wikifunctions Dumps

This directory vendors one dated Wikifunctions current-pages dump so local analysis can start without crawling the public Wikifunctions API or repeatedly downloading the dump.

Current vendored snapshot:

```text
date: 20260801
file: third_party/wikifunctions-dumps/20260801/wikifunctionswiki-20260801-pages-meta-current.xml.bz2
bytes: 16945649
md5: 03eee30b1bea2e5c38aceba5aa396ce5
source: https://dumps.wikimedia.org/wikifunctionswiki/20260801/
latest index used: https://dumps.wikimedia.org/wikifunctionswiki/latest/
```

Import it into the local cache with:

```sh
make import-vendored-dump
```

Use `make download-dump` only when intentionally refreshing from Wikimedia.

To inspect the compressed XML without expanding it in place:

```sh
bunzip2 -c third_party/wikifunctions-dumps/20260801/wikifunctionswiki-20260801-pages-meta-current.xml.bz2 | more
```

Wikimedia's dump licensing page says Wikifunctions main-namespace function definitions, labels, and documentation are CC0, and main-namespace code fragments and implementations are Apache 2.0. Text in other namespaces is CC BY-SA 4.0.
