FROM node:24-alpine
WORKDIR /app
COPY server.mjs .
RUN mkdir /data && chown node:node /data
USER node
ENV DB_PATH=/data/tokai.sqlite
EXPOSE 8080
CMD ["node", "server.mjs"]
