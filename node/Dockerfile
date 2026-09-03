# Stage 1: builder - instala dependencias de producao e baixa o dockerize
FROM node:22-bookworm-slim AS builder

WORKDIR /usr/src/app

COPY package*.json ./
RUN npm install --omit=dev

COPY . .

ENV DOCKERIZE_VERSION=v0.6.1

RUN apt-get update \
    && apt-get install -y --no-install-recommends wget ca-certificates \
    && wget https://github.com/jwilder/dockerize/releases/download/$DOCKERIZE_VERSION/dockerize-linux-amd64-$DOCKERIZE_VERSION.tar.gz \
    && tar -C /usr/local/bin -xzvf dockerize-linux-amd64-$DOCKERIZE_VERSION.tar.gz \
    && rm dockerize-linux-amd64-$DOCKERIZE_VERSION.tar.gz \
    && rm -rf /var/lib/apt/lists/*

# Stage 2: runtime - so o necessario para rodar a aplicacao, sem toolchain de build
FROM node:22-bookworm-slim AS runtime

WORKDIR /usr/src/app

RUN groupadd --gid 1001 nodejs \
    && useradd --uid 1001 --gid nodejs --no-create-home --shell /usr/sbin/nologin nodejs

COPY --from=builder /usr/local/bin/dockerize /usr/local/bin/dockerize
COPY --from=builder --chown=nodejs:nodejs /usr/src/app ./

USER nodejs

EXPOSE 3000
