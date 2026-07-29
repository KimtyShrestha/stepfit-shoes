# Pinned minor version on Alpine: small base image, fewer packages,
# substantially fewer CVEs than a Debian-based Node image.
FROM node:20-alpine

WORKDIR /app

# Copy manifests first so dependency layers cache independently of
# source changes, keeping rebuilds fast.
COPY package*.json ./

# --omit=dev excludes nodemon and other development tooling from the
# production image, reducing the installed attack surface.
RUN npm ci --omit=dev && npm cache clean --force

COPY src ./src
COPY migrations ./migrations

# The node:alpine images ship a non-root 'node' user. Running as root
# inside a container means a process escape starts with root privileges.
USER node

EXPOSE 4000

# Signals a healthy container to the orchestrator.
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://localhost:4000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "src/index.js"]