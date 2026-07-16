# API + worker image (Supervised Crew marketing agent)
FROM node:22-alpine AS base
WORKDIR /app
RUN apk add --no-cache libc6-compat

FROM base AS deps
COPY package.json package-lock.json* ./
RUN npm ci 2>/dev/null || npm install

FROM base AS build
COPY --from=deps /app/node_modules ./node_modules
COPY package.json tsconfig.json ./
COPY src ./src
RUN npm run build

FROM base AS runner
ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=3001
RUN addgroup -g 1001 -S nodejs && adduser -S nodejs -u 1001
COPY --from=deps /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY package.json ./
USER nodejs
EXPOSE 3001
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://127.0.0.1:3001/health || exit 1
CMD ["node", "dist/index.js"]
