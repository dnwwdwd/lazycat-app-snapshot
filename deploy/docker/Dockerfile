FROM golang:1.23-alpine AS server-test

WORKDIR /workspace
COPY go.mod ./
COPY apps/server/cmd/poc ./apps/server/cmd/poc
RUN go test ./...

FROM server-test AS server-build

RUN CGO_ENABLED=0 GOOS=linux go build -trimpath -ldflags='-s -w' -o /out/app ./apps/server/cmd/poc

FROM node:22-alpine AS web-build

WORKDIR /workspace/apps/web
COPY apps/web/package.json apps/web/package-lock.json ./
RUN npm ci
COPY apps/web ./
RUN npm test && npm run build

FROM registry.lazycat.cloud/lzc/lzcapp:3.20.3
WORKDIR /app
COPY --from=server-build /out/app /app/app
COPY --from=web-build /workspace/apps/web/dist /app/web
EXPOSE 8080
ENV WEB_ROOT=/app/web
CMD ["/app/app"]
