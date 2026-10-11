# The site's loop:
#   make dev               content sync + astro dev on :4321
#   make build             content sync + astro build into dist/
#   make deploy            build HEAD and switch DEPLOY_HOST to it
#   make deploy-rollback   back to the previous release

.PHONY: help dev build gates deploy deploy-rollback

# A bare `make` lists the targets rather than running the first one. Every
# target's `## text` comment is its one-line description here.
.DEFAULT_GOAL := help

help: ## show this list of targets
	@echo "Usage: make <target>"
	@echo
	@awk 'BEGIN {FS = ":.*## "} /^[a-zA-Z0-9_-]+:.*## / {printf "  \033[36m%-28s\033[0m %s\n", $$1, $$2}' $(MAKEFILE_LIST)

dev: ## sync the blog content, then serve with hot reload on http://localhost:4321
	pnpm dev

build: ## sync the blog content, then build the site into dist/
	pnpm build

gates: ## every gate, against the current dist/ (several need a local Chrome)
	pnpm gates

deploy: ## build HEAD and roll it out to DEPLOY_HOST over ssh (ARGS="--check" to preview; scripts/deploy_remote.sh --help)
	scripts/deploy_remote.sh $(ARGS)

deploy-rollback: ## put DEPLOY_HOST back on the previously deployed release, headers included
	scripts/deploy_remote.sh --rollback $(ARGS)
