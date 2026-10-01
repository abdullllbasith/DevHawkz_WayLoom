FROM node:24.19.0-bookworm-slim

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

WORKDIR /work/apps/web

EXPOSE 3000

CMD ["npm", "run", "dev", "--", "--hostname", "0.0.0.0", "--port", "3000"]
