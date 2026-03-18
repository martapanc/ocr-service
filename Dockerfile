# ── Build stage ────────────────────────────────────────────────────────────────
FROM node:20-alpine AS builder

WORKDIR /app

COPY package.json yarn.lock ./
RUN yarn install --frozen-lockfile

COPY tsconfig.json ./
COPY src/ ./src/

# Compile TypeScript and copy static assets (tsc doesn't copy non-TS files)
RUN yarn build && cp -r src/public dist/public

# ── Production stage ───────────────────────────────────────────────────────────
FROM node:20-alpine

WORKDIR /app

COPY package.json yarn.lock ./
RUN yarn install --frozen-lockfile --production

COPY --from=builder /app/dist ./dist

# Tesseract language models
COPY *.traineddata ./

RUN mkdir -p tmp output

EXPOSE 3089

CMD ["node", "dist/server.js"]
