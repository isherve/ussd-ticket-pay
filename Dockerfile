FROM node:20-bookworm-slim AS build
WORKDIR /app
RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
RUN npm ci
COPY apps/api apps/api
WORKDIR /app/apps/api
RUN npx prisma generate && npx tsc -p tsconfig.json

FROM node:20-bookworm-slim
WORKDIR /app
RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/* \
  && mkdir -p /data \
  && chown node:node /data
COPY --from=build /app/node_modules /app/node_modules
COPY --from=build /app/package.json /app/package.json
COPY --from=build /app/apps/api/package.json /app/apps/api/package.json
COPY --from=build /app/apps/api/dist /app/apps/api/dist
COPY --from=build /app/apps/api/prisma /app/apps/api/prisma
WORKDIR /app/apps/api
ENV NODE_ENV=production
ENV DATABASE_URL=file:/data/ussd.db
ENV WEBHOOK_SECRET=recruit-demo-webhook
ENV ADMIN_SECRET=recruit-demo-admin
ENV PUBLIC_BASE_URL=https://ussd-ticket-pay.vercel.app
ENV WEB_APP_URL=https://ussd-ticket-pay.vercel.app
ENV CORS_ORIGIN=https://ussd-ticket-pay.vercel.app
ENV ENABLE_CRON=false
USER node
EXPOSE 3000
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/src/server.js"]
