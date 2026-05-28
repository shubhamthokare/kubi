FROM node:20-alpine AS builder

WORKDIR /app

COPY package*.json ./

RUN npm ci

COPY . .

ENV NEXT_TELEMETRY_DISABLED=1
ENV NODE_OPTIONS="--max-old-space-size=1536"
ENV NEXT_PRIVATE_MAX_BUILD_WORKERS=1

ENV BACKEND_URL=http://kubi-backend-service:8000
RUN npm run build && npm cache clean --force

FROM node:20-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

RUN addgroup -S kubi && adduser -S kubi -G kubi

COPY --chown=kubi:kubi --from=builder /app/package*.json ./
COPY --chown=kubi:kubi --from=builder /app/.next ./.next
COPY --chown=kubi:kubi --from=builder /app/public ./public
COPY --chown=kubi:kubi --from=builder /app/node_modules ./node_modules
COPY --chown=kubi:kubi --from=builder /app/next.config.ts ./

RUN npm prune --omit=dev

USER kubi

EXPOSE 80

CMD ["npm", "start", "--", "-p", "80"]