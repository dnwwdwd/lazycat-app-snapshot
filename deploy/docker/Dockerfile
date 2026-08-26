FROM registry.lazycat.cloud/lzc/lzcapp:3.20.3 AS builder

RUN apk add --no-cache go
WORKDIR /workspace
COPY go.mod ./
COPY apps/server/cmd/poc/main.go ./apps/server/cmd/poc/main.go
RUN CGO_ENABLED=0 GOOS=linux go build -trimpath -ldflags='-s -w' -o /workspace/app ./apps/server/cmd/poc

FROM registry.lazycat.cloud/lzc/lzcapp:3.20.3
WORKDIR /app
COPY --from=builder /workspace/app /app/app
EXPOSE 8080
USER root
CMD ["/app/app"]
