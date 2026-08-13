#!/usr/bin/env bash
set -euo pipefail

switch="${OPAM_SWITCH:-fstar}"
compiler="${OCAML_COMPILER:-ocaml-base-compiler.4.14.1}"
package="${FSTAR_PACKAGE:-fstar}"

if ! command -v opam >/dev/null 2>&1; then
  cat >&2 <<'EOF'
opam is required to install F*.

macOS:
  brew install opam gmp pkg-config z3

Debian/Ubuntu:
  sudo apt-get update
  sudo apt-get install -y opam libgmp-dev pkg-config z3

Then rerun:
  make setup-fstar
EOF
  exit 127
fi

if ! opam switch list >/dev/null 2>&1; then
  opam init -y --disable-shell-hook
fi

if ! opam switch list --short | awk -v target="$switch" '$0 == target { found = 1 } END { exit found ? 0 : 1 }'; then
  opam switch create "$switch" "$compiler"
fi

opam install --switch="$switch" -y "$package"

fstar_source="$(opam var --switch="$switch" fstar:build 2>/dev/null || true)"
if [[ -x "$fstar_source/.scripts/get_fstar_z3.sh" ]]; then
  "$fstar_source/.scripts/get_fstar_z3.sh" third_party/fstar-z3/bin
elif [[ -x "$(opam var --switch="$switch" prefix)/.opam-switch/sources/fstar.2025.03.25/.scripts/get_fstar_z3.sh" ]]; then
  "$(opam var --switch="$switch" prefix)/.opam-switch/sources/fstar.2025.03.25/.scripts/get_fstar_z3.sh" third_party/fstar-z3/bin
else
  cat >&2 <<'EOF'
Could not find F*'s get_fstar_z3.sh helper. If make fstar-check reports a Z3
version error, install the expected z3-4.8.5/z3-4.13.3 binaries and put them
on PATH.
EOF
fi

if [[ -d "third_party/fstar-z3/bin" ]]; then
  export PATH="$PWD/third_party/fstar-z3/bin:$PATH"
fi

if opam exec --switch="$switch" -- fstar.exe --version >/dev/null 2>&1; then
  opam exec --switch="$switch" -- fstar.exe --version
elif opam exec --switch="$switch" -- fstar --version >/dev/null 2>&1; then
  opam exec --switch="$switch" -- fstar --version
else
  echo "F* installed but no fstar.exe/fstar command was found in switch $switch" >&2
  exit 127
fi

if command -v z3 >/dev/null 2>&1; then
  z3 --version
else
  cat >&2 <<'EOF'
z3 is not on PATH. Install it before relying on F* verification.

macOS:
  brew install z3

Debian/Ubuntu:
  sudo apt-get install -y z3
EOF
fi

make fstar-check
