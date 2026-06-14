# Project Direction

Flowybooks is built around a local-first open-source accounting core. The core
bookkeeping engine is intended to remain useful on its own and actively
maintained by Flowybooks, Inc.

## Open-Source Core

Near-term public work is focused on making the local accounting foundation more
dependable:

- stronger journal, chart-of-accounts, import, and reporting workflows;
- better auditability, deterministic restore, and local data durability;
- clearer setup, migration, backup, and contributor documentation;
- tighter security defaults for local and self-hosted operation;
- more reliable statement import review and categorization.

## Kevin Direction

Kevin is early software today. The public direction is to improve Kevin into a
more useful accounting assistant for routine bookkeeping, company accounting
workflows, document understanding, and carefully source-gated tax workflows.

Kevin should continue to work through deterministic accounting services rather
than bypassing them. Proposed entries, account changes, imports, and restores
must remain org-scoped, reviewable, and protected by app-level validation.

## Repository Boundary

This repository is the open-source local-first core. Hosted services,
company-specific operations, private infrastructure, or commercial workflows may
live outside this repository unless Flowybooks, Inc. explicitly open sources
them here.

This document is intentionally directional. It is not a timeline, product
commitment, monetization plan, or complete company roadmap.
