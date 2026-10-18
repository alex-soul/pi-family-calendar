FROM --platform=$BUILDPLATFORM node:24.18.0-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts
COPY . .
RUN npm run check && npm run build

FROM node:24.18.0-bookworm-slim AS runtime
ARG APP_REVISION=development
ARG APP_BUILD_DATE
ARG APP_RELEASE_CHANNEL=development
LABEL org.opencontainers.image.revision=$APP_REVISION
LABEL org.opencontainers.image.created=$APP_BUILD_DATE
LABEL org.opencontainers.image.source=https://github.com/alex-soul/pi-family-calendar
LABEL org.opencontainers.image.licenses=MIT
LABEL io.pi-family-calendar.release-channel=$APP_RELEASE_CHANNEL
ENV APP_REVISION=$APP_REVISION
ENV APP_BUILD_DATE=$APP_BUILD_DATE
ENV APP_RELEASE_CHANNEL=$APP_RELEASE_CHANNEL
ENV NODE_ENV=production HOST=0.0.0.0 PORT=3000 DATA_DIR=/app/data
WORKDIR /app
COPY --from=build --chown=node:node /app/build ./build
COPY --from=build --chown=node:node /app/package.json /app/package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts && npm cache clean --force
RUN mkdir /app/data && chown node:node /app/data
COPY --chown=node:node scripts/reset-admin.mjs ./scripts/reset-admin.mjs
COPY --chown=node:node scripts/serve.mjs ./scripts/serve.mjs
COPY --chown=node:node scripts/data-tool.mjs ./scripts/data-tool.mjs
COPY --chown=node:node LICENSE ./LICENSE
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s CMD node -e "fetch('http://127.0.0.1:3000/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "scripts/serve.mjs"]
