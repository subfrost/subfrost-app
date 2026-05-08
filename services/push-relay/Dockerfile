FROM node:20-alpine AS builder
WORKDIR /app
COPY package.json ./
RUN npm install
COPY tsconfig.json ./
COPY src ./src
RUN npx tsc

FROM node:20-alpine
WORKDIR /app
RUN apk add --no-cache tini
COPY package.json ./
RUN npm install --omit=dev && npm cache clean --force
COPY --from=builder /app/lib ./lib
ENV NODE_ENV=production
EXPOSE 8080
USER node
ENTRYPOINT ["/sbin/tini","--"]
CMD ["node","lib/index.js"]
