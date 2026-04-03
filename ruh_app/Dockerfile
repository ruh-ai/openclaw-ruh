# ─────────────────────────────────────────────────────────────────────────────
# ruh_app — Flutter Web Production Build
#
# Multi-stage: Flutter SDK builds → nginx serves static files
# ─────────────────────────────────────────────────────────────────────────────

# Stage 1: Build Flutter web app
FROM ghcr.io/cirruslabs/flutter:3.32.0 AS build

WORKDIR /app

# Copy dependency manifests first for layer caching
COPY pubspec.yaml pubspec.lock* ./

RUN flutter pub get

# Copy the rest of the source
COPY . .

# Build args for runtime configuration
ARG API_BASE_URL=
ENV API_BASE_URL=${API_BASE_URL}

RUN flutter build web --release \
    --dart-define=API_BASE_URL=${API_BASE_URL} \
    --base-href="/app/"

# Stage 2: Serve with nginx
FROM nginx:1.27-alpine

# Remove default nginx content
RUN rm -rf /usr/share/nginx/html/*

# Copy built Flutter web app
COPY --from=build /app/build/web /usr/share/nginx/html

# Copy nginx config for SPA routing
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Non-root user for security
RUN addgroup -g 1001 -S appgroup && \
    adduser -u 1001 -S appuser -G appgroup && \
    chown -R appuser:appgroup /usr/share/nginx/html && \
    chown -R appuser:appgroup /var/cache/nginx && \
    chown -R appuser:appgroup /var/log/nginx && \
    touch /var/run/nginx.pid && \
    chown -R appuser:appgroup /var/run/nginx.pid

USER appuser

EXPOSE 3003

HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
    CMD wget -qO- http://localhost:3003/ || exit 1

CMD ["nginx", "-g", "daemon off;"]
