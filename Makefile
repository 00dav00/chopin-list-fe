.PHONY: install test vitest check all

install:
	npm ci

vitest:
	npm test

check:
	npm run check

test: vitest check

all: install test
