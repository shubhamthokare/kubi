FROM node:20-alpine AS builder

WORKDIR /app

COPY package*.json ./

RUN npm ci

COPY . .

ENV NEXT_TELEMETRY_DISABLED=1
ENV NODE_OPTIONS="--max-old-space-size=1536"
ENV NEXT_PRIVATE_MAX_BUILD_WORKERS=1

RUN npm run build && npm cache clean --force

FROM node:20-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

RUN addgroup -S kubi && adduser -S kubi -G kubi

COPY --from=builder /app/package*.json ./
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/public ./public
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/next.config.ts ./

RUN npm prune --omit=dev

RUN chown -R kubi:kubi /app

USER kubi

EXPOSE 80

CMD ["npm", "start", "--", "-p", "80"]