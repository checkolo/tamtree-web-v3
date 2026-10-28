# The waitlist endpoint: one file, no dependencies — see server.mjs.
FROM node:22-alpine
WORKDIR /app
COPY server.mjs ./
USER node
EXPOSE 8787
HEALTHCHECK --interval=30s --timeout=3s CMD wget -qO- http://127.0.0.1:8787/healthz || exit 1
CMD ["node", "server.mjs"]
