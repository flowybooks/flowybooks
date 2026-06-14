# Recommended GitHub Settings

These settings are recommendations for the upstream public repository. They are
not applied by this repo and should be configured by a repository owner in the
GitHub UI.

## Branch Protection

Protect `main` before accepting outside contributions:

- require a pull request before merging;
- require at least one approving review;
- require the CI workflow to pass;
- disallow force pushes;
- disallow direct pushes to `main`;
- require conversation resolution before merge;
- keep administrator bypasses narrow.

Outside contributors should fork the repository and open pull requests. They
cannot push to the upstream repository or merge changes unless Flowybooks, Inc.
explicitly grants them access.

## Actions Safety

Use conservative GitHub Actions defaults:

- set the default workflow token permission to read-only;
- require approval before workflows from first-time or outside contributors run;
- avoid workflows that need write permissions unless they have a specific reason;
- review dependency update pull requests before merge.

The CI workflow in this repository installs dependencies, installs the
Playwright browser, runs the full `bun run verify` gate, and audits
dependencies. Keep workflow permissions read-only unless a future job has a
specific reason to write.
