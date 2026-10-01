FROM node:24.19.0-bookworm-slim

RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /work

COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
COPY packages/ui/package.json packages/ui/package.json
COPY packages/domain/package.json packages/domain/package.json
COPY packages/planning/package.json packages/planning/package.json
COPY packages/shared/package.json packages/shared/package.json

RUN npm ci

COPY . .

# prisma generate reads DATABASE_URL and does not connect. This value is not kept in the image.
RUN DATABASE_URL=postgresql://wayloom_app:build@127.0.0.1:5432/wayloom_development \
  npm run build --workspace @wayloom/api

EXPOSE 4000

CMD ["npm", "run", "start", "--workspace", "@wayloom/api"]
