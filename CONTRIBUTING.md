# Contributing to Ruh

Thanks for your interest in contributing to Ruh! This document explains how to get started.

## Getting Started

1. Fork the repository
2. Clone your fork
3. Create a feature branch from `dev`
4. Make your changes
5. Submit a PR against `dev`

## Development Setup

```bash
# Prerequisites: Docker, Bun >= 1.3, Node.js >= 20

# Start PostgreSQL
docker run -d --name pg \
  -e POSTGRES_USER=openclaw \
  -e POSTGRES_PASSWORD=changeme \
  -e POSTGRES_DB=openclaw \
  -p 5432:5432 postgres:16-alpine

# Configure and run
cp ruh-backend/.env.example ruh-backend/.env
./start.sh
```

## Before Submitting a PR

```bash
# Run all tests
npm run test:all

# TypeScript check
npm run typecheck:all

# Coverage (must meet thresholds)
npm run coverage:all
```

## Code Standards

- TypeScript strict mode
- One logical change per commit
- Every new endpoint needs unit + contract tests
- Every bug fix needs a regression test
- Follow existing patterns in the codebase

## Branch Strategy

- `main` — stable releases
- `dev` — active development (PR target)
- `feat/*` — feature branches
- `fix/*` — bug fix branches

## Architecture

Read `docs/knowledge-base/000-INDEX.md` before making changes. The knowledge base maps all services, endpoints, and flows.

## Questions?

Open an issue or start a discussion. We're happy to help.
