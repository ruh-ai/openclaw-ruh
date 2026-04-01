FROM oven/bun:1 AS base

WORKDIR /app

# Install dependencies (bun.lockb copied for reproducible installs)
COPY ruh-backend/package.json ruh-backend/bun.lock* ./
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
