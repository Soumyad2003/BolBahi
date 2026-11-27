FROM node:22-alpine

WORKDIR /app

# Install dependencies cleanly without requiring package-lock.json
COPY package.json ./
RUN npm install --no-audit --no-fund --legacy-peer-deps

# Copy application source and build the production Vite bundle
COPY . .
RUN npm run build

ENV NODE_ENV=production
ENV PORT=3000

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://127.0.0.1:3000/api/health || exit 1

CMD ["./node_modules/.bin/tsx", "server.ts"]
