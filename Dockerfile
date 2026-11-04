FROM alpine:3.20 AS apk-source
RUN apk add --no-cache apk-tools-static

FROM n8nio/n8n:latest

USER root

# Restore apk and install native Alpine Chromium + Arabic fonts
COPY --from=apk-source /sbin/apk.static /sbin/apk.static
COPY --from=apk-source /etc/apk/repositories /etc/apk/repositories
RUN /sbin/apk.static add --no-cache chromium font-noto-arabic font-noto freetype harfbuzz nss ttf-freefont

# Create working directory and install dependencies if package.json exists
WORKDIR /app
COPY package*.json ./
RUN if [ -f package.json ]; then npm install --omit=dev; fi

# Copy application directories into container
COPY ./data /data
COPY ./config /config
COPY ./workflows /workflows
COPY ./assets /assets
COPY ./scripts /scripts
RUN test -s /scripts/start_n8n.mjs
COPY ./scripts/docker-entrypoint.sh /docker-entrypoint.sh
RUN chmod +x /docker-entrypoint.sh

# Ensure node user owns the required directories
RUN chown -R node:node /data /config /workflows /assets /scripts /app

USER node
WORKDIR /home/node

ENV N8N_BLOCK_ENV_ACCESS_IN_NODE=false
ENV N8N_RUNNERS_GRANT_TOKEN_TTL=120
ENV N8N_PORT=5678
ENV CHROME_BIN=/usr/bin/chromium-browser
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium-browser
EXPOSE 5678
