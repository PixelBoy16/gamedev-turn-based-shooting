# The whole game in one image: the room server also serves the built pages, so one
# address (and one Cloudflare tunnel) carries the game, the admin page, the APIs and
# the WebSocket. See docker-compose.yml.
FROM node:22.20-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
# the pages talk to whatever address they were loaded from
RUN npm run check-config && VITE_SERVER_URL=same-origin npm run build

FROM node:22.20-slim
WORKDIR /app
ENV NODE_ENV=production PORT=2567 STATIC_DIR=/app/dist DATA_DIR=/data
# tsx runs the server's TypeScript directly, so the dev dependencies stay
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY package.json tsconfig.json tsconfig.server.json ./
COPY config ./config
COPY server ./server
COPY src ./src
USER node
EXPOSE 2567
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s \
  CMD node -e "fetch('http://localhost:2567/health').then(r=>process.exit(r.ok?0:1),()=>process.exit(1))"
CMD ["node_modules/.bin/tsx", "server/index.ts"]
