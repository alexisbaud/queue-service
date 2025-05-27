FROM node:18-alpine as build

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build

FROM node:18-alpine

WORKDIR /app

COPY --from=build /app/package*.json ./
COPY --from=build /app/dist ./dist

RUN npm ci --only=production

# Configuration minimale des variables d'environnement
# Les valeurs réelles devraient être fournies via le fichier .env ou des variables d'environnement
ENV PORT=3000
ENV LOG_LEVEL=info

EXPOSE 3000

CMD ["node", "dist/index.js"]
