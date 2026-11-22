FROM node:24-slim AS deps
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
COPY package.json package-lock.json ./
RUN npm ci

FROM deps AS tools
COPY . .

FROM tools AS build
RUN npm run build

FROM node:24-slim
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends curl && rm -rf /var/lib/apt/lists/*
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 HOSTNAME=0.0.0.0 PORT=3000 NODE_OPTIONS="--max-old-space-size=384"
COPY --from=build --chown=node:node /app/.next/standalone ./
COPY --from=build --chown=node:node /app/.next/static ./.next/static
COPY --chown=node:node postgres ./postgres
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=2m --retries=3 \
  CMD curl -sf http://127.0.0.1:3000/health >/dev/null || exit 1
CMD ["node", "server.js"]
