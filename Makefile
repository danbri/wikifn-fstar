.PHONY: test example fstar-check fstar-ocaml fstar-generate-compositions fstar-js-demo fstar-call-js fstar-call-browser fstar-browser-demo setup-fstar doctor verify import-vendored-dump download-dump

test:
	node --test

example:
	node ./bin/wikifn.js eval-example

fstar-check:
	./scripts/fstar-check.sh

fstar-ocaml:
	./scripts/extract-fstar-ocaml.sh

fstar-generate-compositions:
	node scripts/generate-fstar-compositions.js

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
