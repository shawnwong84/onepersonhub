# ---- Builder stage ----
FROM node:22-slim AS builder

WORKDIR /app

# Skip puppeteer's bundled Chromium download during install: the runner
# stage uses the system chromium package instead, so this download is pure
# wasted bandwidth/build time in the builder stage.
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true

COPY package*.json ./
RUN npm ci --no-audit --no-fund

COPY . .

RUN npx prisma generate

# On memory-constrained hosts (small droplets etc.), V8 auto-sizes its heap
# ceiling off the container's memory cgroup and ignores swap, so `next build`
# (webpack compile + typecheck) can hit an internal ~1GB heap limit and abort
# with "JavaScript heap out of memory" even when swap is available at the OS
# level. Raising max-old-space-size explicitly lets it actually use swap.
ENV NODE_OPTIONS="--max-old-space-size=3072"
RUN npm run build

# ---- Runner stage ----
FROM node:22-slim AS runner

LABEL org.opencontainers.image.source="https://github.com/Hesper-Labs/owly"
LABEL org.opencontainers.image.description="AI-powered customer support agent"

RUN apt-get update && apt-get install -y \
    chromium \
    fonts-liberation \
    libappindicator3-1 \
    libasound2 \
    libatk-bridge2.0-0 \
    libatk1.0-0 \
    libcups2 \
    libdbus-1-3 \
    libdrm2 \
    libgbm1 \
    libgtk-3-0 \
    libnspr4 \
    libnss3 \
    libx11-xcb1 \
    libxcomposite1 \
    libxdamage1 \
    libxrandr2 \
    xdg-utils \
    --no-install-recommends \
    && rm -rf /var/lib/apt/lists/*

ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium
ENV NEXT_TELEMETRY_DISABLED=1
ENV NODE_ENV=production
ENV PORT=3000

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

# `adduser --system` (no --home) leaves HOME=/nonexistent, which isn't even
# created. Chromium/crashpad needs a real writable HOME to construct its
# crash-database path, or it fails with "chrome_crashpad_handler: --database
# is required" when whatsapp-web.js launches it. /app is already owned by
# nextjs:nodejs below, so point HOME there instead.
ENV HOME=/app

WORKDIR /app

COPY --from=builder /app/package*.json ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/public ./public
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/prisma.config.ts ./
COPY --from=builder /app/src/generated ./src/generated
COPY --from=builder /app/next.config.ts ./

# Docker seeds a fresh named volume's ownership from whatever already exists
# at that path in the image at first mount. These two directories are only
# ever created lazily at runtime by the app itself, so without pre-creating
# them here, the whatsapp_auth/rag_uploads volumes mount in as root:root -
# and the container runs as the non-root "nextjs" user, so it can't write to
# them ("EACCES: permission denied, mkdir '/app/.wwebjs_auth/session'").
RUN mkdir -p /app/.wwebjs_auth /app/.rag_uploads && chown -R nextjs:nodejs /app

USER nextjs

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=3 \
  CMD node -e "fetch('http://localhost:3000/api/health').then(r => { if (!r.ok) process.exit(1) }).catch(() => process.exit(1))"

CMD ["sh", "-c", "npx prisma migrate deploy && npm start"]
