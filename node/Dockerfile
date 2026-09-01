FROM node:22-bookworm-slim

WORKDIR /usr/src/app

COPY package*.json ./
RUN npm install

COPY . .

ENV DOCKERIZE_VERSION=v0.6.1

RUN apt-get update \
    && apt-get install -y --no-install-recommends wget ca-certificates \
    && wget https://github.com/jwilder/dockerize/releases/download/$DOCKERIZE_VERSION/dockerize-linux-amd64-$DOCKERIZE_VERSION.tar.gz \
    && tar -C /usr/local/bin -xzvf dockerize-linux-amd64-$DOCKERIZE_VERSION.tar.gz \
    && rm dockerize-linux-amd64-$DOCKERIZE_VERSION.tar.gz \
    && rm -rf /var/lib/apt/lists/*

EXPOSE 3000