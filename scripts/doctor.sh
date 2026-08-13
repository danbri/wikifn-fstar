#!/usr/bin/env bash
set -u

echo "Repository:"
pwd
echo

echo "Node:"
node --version 2>&1 || echo "node: missing"
npm --version 2>&1 || echo "npm: missing"
echo

echo "opam:"
opam --version 2>&1 || echo "opam: missing"
opam switch list 2>&1 || true
echo

echo "F*:"
if [[ -n "${FSTAR:-}" ]]; then
  echo "FSTAR=$FSTAR"
  "$FSTAR" --version 2>&1 || true
fi
command -v fstar.exe 2>/dev/null || command -v fstar 2>/dev/null || echo "fstar: not on PATH"
opam exec --switch=fstar -- fstar.exe --version 2>&1 || opam exec --switch=fstar -- fstar --version 2>&1 || true
echo

echo "Z3:"
command -v z3 2>/dev/null || true
z3 --version 2>&1 || echo "z3: missing"
echo

echo "JavaScript tests:"
npm test
echo

echo "F* check:"
make fstar-check
