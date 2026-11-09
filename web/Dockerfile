FROM node:20-alpine AS build
WORKDIR /web
COPY package.json ./
RUN npm install --no-audit --no-fund
COPY . .
# NEXT_PUBLIC_* values are compiled into the browser bundle.
ARG NEXT_PUBLIC_API_URL=http://localhost:4000
ARG NEXT_PUBLIC_CURRENCY=USD
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL NEXT_PUBLIC_CURRENCY=$NEXT_PUBLIC_CURRENCY NEXT_TELEMETRY_DISABLED=1
RUN npm run build

FROM node:20-alpine
WORKDIR /web
ENV NODE_ENV=production PORT=3000 HOSTNAME=0.0.0.0 NEXT_TELEMETRY_DISABLED=1
COPY --from=build /web/.next/standalone ./
COPY --from=build /web/.next/static ./.next/static
COPY --from=build /web/public ./public
USER node
EXPOSE 3000
CMD ["node", "server.js"]
