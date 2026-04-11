FROM oven/bun:1 AS base

WORKDIR /app

# Copy the workspace packages needed by ruh-backend
# Build context is the repo root so ../packages/logger resolves correctly
COPY packages/logger ./packages/logger

# Install logger dependencies first so bun resolves the file: link correctly
RUN cd /app/packages/logger && bun install

COPY ruh-backend/package.json ruh-backend/bun.lock ./ruh-backend/

WORKDIR /app/ruh-backend

RUN bun install --frozen-lockfile

# Copy source
COPY ruh-backend/ .

# Non-root user for security
RUN groupadd --gid 1001 appgroup && \
    useradd --uid 1001 --gid appgroup --no-create-home appuser && \
    chown -R appuser:appgroup /app

USER appuser

EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=10s --start-period=10s --retries=3 \
  CMD curl -f http://localhost:8000/health || exit 1

CMD ["bun", "run", "src/index.ts"]
