.PHONY: test example fstar-generate-eval fstar-engine engine-testers closure fstar-check fstar-verify-functions fstar-ocaml fstar-generate-compositions fstar-js-demo fstar-call-js fstar-call-browser fstar-browser-demo setup-fstar doctor verify import-vendored-dump download-dump

test:
	node --test

example:
	node ./bin/wikifn.js eval-example

fstar-check:
	./scripts/fstar-check.sh

# Every composition body as its own F* module, checked in parallel. The part
# modules under src/fstar are what extracts; these are what isolates a failure
# to one function, and what makes a regeneration re-check only what changed.
fstar-verify-functions:
	node scripts/verify-fstar-functions.js

fstar-ocaml:
	./scripts/extract-fstar-ocaml.sh

fstar-generate-compositions:
	node scripts/generate-fstar-compositions.js

fstar-generate-eval:
	node scripts/generate-fstar-eval.js

fstar-engine:
	./scripts/build-fstar-engine.sh
	node scripts/export-all-scheme.js

engine-testers:
	node scripts/check-engine-testers.js

closure:
	node scripts/analyze-closure.js --set engine

fstar-js-demo:
	./scripts/build-fstar-js-demo.sh

fstar-call-js:
	./scripts/build-fstar-call.sh

fstar-call-browser:
	./scripts/build-fstar-call-browser.sh

fstar-browser-demo:
	./scripts/build-fstar-browser-demo.sh

setup-fstar:
	./scripts/setup-fstar.sh

doctor:
	./scripts/doctor.sh

verify: test fstar-check

import-vendored-dump:
	./scripts/import-vendored-wikifunctions-dump.sh

download-dump:
	./scripts/download-wikifunctions-dump.sh
