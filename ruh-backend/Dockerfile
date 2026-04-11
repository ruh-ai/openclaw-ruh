FROM oven/bun:1 AS base

WORKDIR /app

# Copy the workspace packages needed by ruh-backend
# Build context is the repo root so ../packages/logger resolves correctly
COPY packages/logger ./packages/logger

COPY ruh-backend/package.json ruh-backend/bun.lock ./ruh-backend/

WORKDIR /app/ruh-backend

RUN bun install --frozen-lockfile

# Copy source
COPY ruh-backend/ .

# Fix workspace symlinks: bun install may create symlinks to the Docker build
# host's absolute path instead of the container path. Replace the symlinked
# @ruh/logger with a real copy from the known-good location.
RUN rm -rf node_modules/@ruh/logger && \
    mkdir -p node_modules/@ruh && \
    cp -rL /app/packages/logger node_modules/@ruh/logger

# Non-root user for security
RUN groupadd --gid 1001 appgroup && \
    useradd --uid 1001 --gid appgroup --no-create-home appuser && \
    chown -R appuser:appgroup /app

USER appuser

EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=10s --start-period=10s --retries=3 \
  CMD curl -f http://localhost:8000/health || exit 1

CMD ["bun", "run", "src/index.ts"]
