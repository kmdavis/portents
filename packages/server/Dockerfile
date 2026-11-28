FROM node:24-bookworm-slim AS build

RUN apt-get update \
	&& apt-get install -y --no-install-recommends python3 make g++ \
	&& rm -rf /var/lib/apt/lists/*
RUN corepack enable && corepack prepare pnpm@10.28.0 --activate
WORKDIR /app
COPY . .
RUN pnpm install --frozen-lockfile
RUN pnpm -r build

FROM node:24-bookworm-slim
WORKDIR /app
COPY --from=build /app /app
RUN mkdir -p /data && chown node:node /data
ENV PORTENTS_DATA_DIR=/data
VOLUME ["/data"]
EXPOSE 7331
USER node
ENTRYPOINT ["node", "packages/server/dist/cli.js"]
CMD ["start"]
