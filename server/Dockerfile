FROM node:24-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev --ignore-scripts
COPY server ./server
USER node
EXPOSE 8080
CMD ["node", "server/server.mjs"]
