# Multi-stage: Vite build (root base) + nginx entrypoint.
# Build context: repo root (see infra/docker-compose.yml).

FROM node:24-alpine AS web-build
WORKDIR /web
COPY web/package.json web/package-lock.json ./
RUN npm ci
COPY web/ .
ENV VITE_BASE=/
RUN npm run build

FROM nginx:1.27-alpine
RUN apk add --no-cache wget
COPY infra/nginx/nginx.conf /etc/nginx/nginx.conf
COPY --from=web-build /web/dist /usr/share/nginx/html
# Game JSON монтируется compose-ом в /usr/share/nginx/data
RUN mkdir -p /usr/share/nginx/data

EXPOSE 80
