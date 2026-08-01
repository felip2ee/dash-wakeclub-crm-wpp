FROM oven/bun:1.3.14-alpine AS dependencies

WORKDIR /app
COPY package.json bun.lock bunfig.toml ./
RUN bun install --frozen-lockfile

FROM dependencies AS build

COPY . .
RUN bun run build

FROM oven/bun:1.3.14-alpine AS runtime

LABEL org.opencontainers.image.source="https://github.com/felip2ee/dash-wakeclub-crm-wpp"
LABEL org.opencontainers.image.description="Wake Club CRM WhatsApp dashboard"

WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000

COPY package.json bun.lock bunfig.toml ./
RUN bun install --frozen-lockfile --production
COPY --from=build --chown=bun:bun /app/dist ./dist

USER bun
EXPOSE 3000

CMD ["bun", "dist/server/server.js"]

