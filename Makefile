.PHONY: test example fstar-check setup-fstar doctor verify

test:
	node --test

example:
	node ./bin/wikifn.js eval-example

fstar-check:
	./scripts/fstar-check.sh

setup-fstar:
	./scripts/setup-fstar.sh

doctor:
	./scripts/doctor.sh

verify: test fstar-check
