FROM n8nio/n8n:latest

USER root

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
RUN chmod +x /scripts/start_n8n.sh

# Ensure node user owns the required directories
RUN chown -R node:node /data /config /workflows /assets /scripts /app

USER node
WORKDIR /home/node

ENV N8N_PORT=5678
EXPOSE 5678

CMD ["/scripts/start_n8n.sh"]
