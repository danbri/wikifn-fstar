.PHONY: test example fstar-check

test:
	node --test

example:
	node ./bin/wikifn.js eval-example

fstar-check:
	./scripts/fstar-check.sh
