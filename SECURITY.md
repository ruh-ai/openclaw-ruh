# Security Policy

## Reporting a Vulnerability

If you discover a security vulnerability in Ruh, please report it responsibly. **Do not open a public GitHub issue.**

### How to Report

Email **security@ruh.ai** with:

- Description of the vulnerability
- Steps to reproduce
- Affected service(s) and version(s)
- Potential impact

### What to Expect

- **Acknowledgment** within 48 hours
- **Status update** within 7 days
- **Fix timeline** shared once the issue is triaged

We will credit reporters in the release notes unless you prefer to remain anonymous.

## Supported Versions

| Version | Supported |
|---------|-----------|
| Latest `main` | Yes |
| Older releases | Best effort |

## Scope

The following are in scope for security reports:

- **ruh-backend** — API server, authentication, sandbox orchestration
- **agent-builder-ui** — Agent creation interface
- **ruh-frontend** — Client application
- **admin-ui** — Platform administration
- **Docker sandbox containers** — Agent runtime isolation

Out of scope: third-party dependencies (report those upstream), social engineering, and denial of service against development environments.

## Security Best Practices for Contributors

- Never commit secrets, API keys, or `.env` files
- Use parameterized queries (no raw SQL concatenation)
- Validate all user input at system boundaries
- Follow the auth middleware patterns (`requireAuth`, `requireRole`)
- Review OWASP Top 10 before touching auth or input handling code
