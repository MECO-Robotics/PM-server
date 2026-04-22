FROM node:22-alpine AS deps
WORKDIR /app
COPY package*.json ./
COPY prisma ./prisma
COPY prisma.config.ts ./
RUN npm ci

FROM deps AS build
WORKDIR /app
COPY tsconfig.json ./
COPY src ./src
ARG DATABASE_URL=postgresql://postgres:postgres@localhost:5432/meco_platform?schema=public
ENV DATABASE_URL=${DATABASE_URL}
RUN npx prisma generate && npm run build

FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY package*.json ./
COPY prisma ./prisma
COPY prisma.config.ts ./
RUN npm ci
COPY --from=build /app/dist ./dist
EXPOSE 8080
CMD ["npm", "run", "start"]
