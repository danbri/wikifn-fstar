#!/usr/bin/env bash
set -euo pipefail

dump_dir="${WIKIFUNCTIONS_VENDORED_DUMP_DIR:-third_party/wikifunctions-dumps/20260801}"
compressed_dump="$dump_dir/wikifunctionswiki-20260801-pages-meta-current.xml.bz2"
expanded_dump="$dump_dir/wikifunctionswiki-20260801-pages-meta-current.xml"
dump="${WIKIFUNCTIONS_VENDORED_DUMP:-}"
checksum_file="${WIKIFUNCTIONS_VENDORED_DUMP_MD5S:-$dump_dir/wikifunctionswiki-20260801-md5sums.txt}"

if [[ -z "$dump" ]]; then
  if [[ -f "$compressed_dump" ]]; then
    dump="$compressed_dump"
  elif [[ -f "$expanded_dump" ]]; then
    dump="$expanded_dump"
  else
    dump="$compressed_dump"
  fi
fi

if [[ ! -f "$dump" ]]; then
  echo "Missing vendored Wikifunctions dump: $dump" >&2
  exit 1
fi

if [[ "$dump" = *.bz2 ]]; then
  if [[ ! -f "$checksum_file" ]]; then
    echo "Missing checksum file: $checksum_file" >&2
    exit 1
  fi

  expected="$(awk -v name="$(basename "$dump")" '$2 == name { print $1; exit }' "$checksum_file")"
  if [[ -z "$expected" ]]; then
    echo "Could not find $(basename "$dump") in $checksum_file" >&2
    exit 1
  fi

  if command -v md5sum >/dev/null 2>&1; then
    actual="$(md5sum "$dump" | awk '{ print $1 }')"
  elif command -v md5 >/dev/null 2>&1; then
    actual="$(md5 -q "$dump")"
  else
    echo "Need md5sum or md5 to verify the vendored dump" >&2
    exit 1
  fi

  if [[ "$actual" != "$expected" ]]; then
    echo "MD5 mismatch for $dump" >&2
    echo "expected $expected" >&2
    echo "actual   $actual" >&2
    exit 1
  fi
else
  echo "Importing expanded dump without upstream compressed-file MD5 verification: $dump" >&2
fi

node ./bin/wikifn.js cache import-xml "$dump" "$@"
