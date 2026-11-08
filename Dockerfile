# syntax=docker/dockerfile:1
FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
# Optional CA mount supports builds behind a trusted TLS inspection proxy.
RUN --mount=type=secret,id=proxy_ca \
    if [ -f /run/secrets/proxy_ca ]; then export NODE_EXTRA_CA_CERTS=/run/secrets/proxy_ca; fi; \
    npm ci --no-audit --no-fund
ARG VITE_SECTION_ORDER="Recently Added,Continue Watching,Unwatched Movies"
COPY tsconfig.json vite.config.ts index.html ./
COPY src ./src
COPY public ./public
RUN npm run build && chmod -R a+rX /app/dist

FROM nginx:stable-alpine AS runtime
COPY --from=build /app/dist /usr/share/nginx/html
COPY --chmod=644 docker/nginx.conf.template /etc/nginx/plexplore.conf.template
COPY --chmod=755 docker/entrypoint.sh /usr/local/bin/plexplore-entrypoint
ENV PLEX_SERVER_URL=http://192.168.178.46:32400
USER nginx
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD wget -Y off -q -O /dev/null http://127.0.0.1:8080/healthz || exit 1
ENTRYPOINT ["/usr/local/bin/plexplore-entrypoint"]
