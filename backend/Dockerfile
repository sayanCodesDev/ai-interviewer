# The API. Build from the backend/ folder:  docker build -t ai-interviewer-api backend
#
# It needs the Docker CLI because every candidate code run starts a throwaway sandbox container. Point DOCKER_HOST
# at a Docker daemon (or at the socket proxy in docker-compose.yml). See docs/DEPLOYMENT.md for the trade-offs.
FROM docker:27-cli AS dockercli

FROM node:22-bookworm-slim
ENV NODE_ENV=production
WORKDIR /app

# Prisma's tooling needs OpenSSL, which the slim image leaves out.
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Dependencies first, so they are cached until package.json changes. `npm ci` also runs `prisma generate`,
# which needs the schema, so those two files come before it.
COPY package.json package-lock.json ./
COPY prisma ./prisma
COPY prisma.config.ts ./
RUN npm ci

COPY tsconfig.json ./
COPY lib ./lib
COPY src ./src
COPY --from=dockercli /usr/local/bin/docker /usr/local/bin/docker

USER node
EXPOSE 2000
HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||2000)+'/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

# Apply any pending database migrations (they only ever add what is missing), then start the server.
# (The Prisma client was already generated during `npm ci`; the app folder is not writable by this user.)
CMD ["sh", "-c", "npx prisma migrate deploy && exec npx tsx src/index.ts"]
