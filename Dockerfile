FROM node:20-alpine AS builder
WORKDIR /app
RUN apk add --no-cache openssl
COPY package.json package-lock.json* ./
RUN npm ci
COPY prisma ./prisma
RUN npx prisma generate
COPY tsconfig.json ./
COPY src ./src
RUN npm run build

FROM node:20-alpine
WORKDIR /app
ENV NODE_ENV=production
# Prisma query engine (Alpine musl + OpenSSL 3)
RUN apk add --no-cache openssl
COPY package.json package-lock.json* ./
RUN npm ci --omit=dev
COPY prisma ./prisma
RUN npx prisma generate
COPY --from=builder /app/dist ./dist
EXPOSE 3001
CMD ["node", "dist/index-api.js"]
