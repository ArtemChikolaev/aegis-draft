# Go API skeleton (ADR 0002). Игровые данные — static-first, не через этот контейнер.

FROM golang:1.26-alpine AS build
WORKDIR /src
COPY go.mod go.sum ./
RUN go mod download
COPY . .
RUN CGO_ENABLED=0 go build -ldflags="-s -w" -o /api ./cmd/api

FROM alpine:3.20
RUN apk add --no-cache ca-certificates wget
USER nobody
COPY --from=build /api /api
EXPOSE 8080
ENTRYPOINT ["/api"]
