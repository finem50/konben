# node:22-slim rather than alpine on purpose: better-sqlite3 is a native module
# and ships glibc prebuilds, so musl would force a source build and drag a
# compiler toolchain into the image.
FROM node:22-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
# --ignore-scripts because npm auto-runs `node-gyp rebuild` for any package
# carrying a binding.gyp, which would compile better-sqlite3 from source and
# need python3/make/g++ in the image. The package already ships a prebuilt
# linux binary; this uses it, and keeps install scripts from running at all.
RUN npm ci --ignore-scripts

FROM node:22-slim AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

FROM node:22-slim AS runner
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0 \
    DATABASE_PATH=/data/konben.db

# The database lives on a mounted volume, never in the image.
RUN mkdir -p /data && chown node:node /data

COPY --from=builder --chown=node:node /app/.next/standalone ./
COPY --from=builder --chown=node:node /app/.next/static ./.next/static
# Migrations are applied at boot, so the SQL has to ship with the app.
COPY --from=builder --chown=node:node /app/drizzle ./drizzle

USER node
EXPOSE 3000

CMD ["node", "server.js"]
