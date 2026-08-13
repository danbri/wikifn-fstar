#!/usr/bin/env bash
set -euo pipefail

base_url="${WIKIFUNCTIONS_DUMP_BASE:-https://dumps.wikimedia.org/wikifunctionswiki/latest}"
out_root="${WIKIFUNCTIONS_DUMP_DIR:-cache/dumps/wikifunctionswiki}"
target_kind="${1:-pages-meta-current.xml.bz2}"

mkdir -p "$out_root"

checksums_tmp="$(mktemp)"
trap 'rm -f "$checksums_tmp"' EXIT

curl -L --fail --silent --show-error "$base_url/wikifunctionswiki-latest-md5sums.txt" -o "$checksums_tmp"

line="$(awk -v suffix="$target_kind" '$2 ~ suffix "$" { print; exit }' "$checksums_tmp")"
if [[ -z "$line" ]]; then
  echo "Could not find a dump ending in $target_kind in latest md5sums" >&2
  exit 1
fi

expected_md5="${line%% *}"
filename="${line##* }"
date="$(echo "$filename" | sed -E 's/^wikifunctionswiki-([0-9]{8})-.*/\1/')"
if [[ "$date" = "$filename" ]]; then
  echo "Could not infer dump date from $filename" >&2
  exit 1
fi

out_dir="$out_root/$date"
out_file="$out_dir/$filename"
checksum_file="$out_dir/wikifunctionswiki-$date-md5sums.txt"
url="https://dumps.wikimedia.org/wikifunctionswiki/$date/$filename"

mkdir -p "$out_dir"
cp "$checksums_tmp" "$checksum_file"

md5_file() {
  if command -v md5sum >/dev/null 2>&1; then
    md5sum "$1" | awk '{ print $1 }'
  elif command -v md5 >/dev/null 2>&1; then
    md5 -q "$1"
  else
    echo "Need md5sum or md5 to verify dumps" >&2
    exit 1
  fi
}

if [[ -f "$out_file" ]]; then
  actual_md5="$(md5_file "$out_file")"
  if [[ "$actual_md5" = "$expected_md5" ]]; then
    echo "$out_file"
    exit 0
  fi
  echo "Existing file failed MD5; downloading again: $out_file" >&2
fi

curl -L --fail --remote-time -C - -o "$out_file" "$url"

actual_md5="$(md5_file "$out_file")"
if [[ "$actual_md5" != "$expected_md5" ]]; then
  echo "MD5 mismatch for $out_file" >&2
  echo "expected $expected_md5" >&2
  echo "actual   $actual_md5" >&2
  exit 1
fi

echo "$out_file"
