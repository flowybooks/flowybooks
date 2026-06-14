# Security Policy

## Supported Versions

The `main` branch receives security fixes. This project is intended for local
self-hosting; upgrade by pulling the latest release or commit and rerunning
migrations.

## Reporting Vulnerabilities

For the upstream Flowybooks repository, please use GitHub private vulnerability
reporting. For forks, use the fork maintainer's private reporting channel if one
exists.

Do not post exploitable details, real statements, secrets, customer data, local
database files, or source documents in public issues before a fix is available.

## Local Security Checklist

- Keep `.env` out of git.
- Use a unique `BETTER_AUTH_SECRET` and `CRON_SECRET`.
- Keep the local PGlite data directory private and backed up safely.
- Restrict access to database backups and statement exports.
- Enable AI only with a local model runtime or provider account you trust for
  the data being sent.
- Treat Kevin's answers as drafts unless they are backed by the app's deterministic
  accounting rules or allowed official sources.
- Run `bun audit` or your package manager's audit command before releases.
- Run a secret scan before publishing a fork or release artifact.

## Deployment Notes

Flowybooks includes small in-memory rate limiters for local self-hosted
deployments. If you run multiple app instances or deploy to serverless/cloud
infrastructure, put a reverse proxy, platform firewall, or distributed
rate-limiting layer in front of state-changing routes.

The open-source repo intentionally does not include billing, hosted subscription
gates, payment-provider SDKs, hosted telemetry, or managed email delivery.
