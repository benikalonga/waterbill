FROM node:20-slim
WORKDIR /srv/api
RUN apt-get update -y && apt-get install -y --no-install-recommends openssl && rm -rf /var/lib/apt/lists/*

COPY package.json ./
RUN npm install --no-audit --no-fund

COPY prisma ./prisma
COPY tsconfig.json ./
COPY src ./src
RUN npx prisma generate && npx tsc

ENV NODE_ENV=production
EXPOSE 4000
# Apply the schema, then start the API.
CMD ["sh", "-c", "npx prisma db push --skip-generate && node dist/server.js"]
