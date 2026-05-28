# syntax=docker/dockerfile:1.7
FROM node:24-alpine
WORKDIR /app
COPY package.json server.js ./
ENV PORT=4000
EXPOSE 4000
USER node
CMD ["node", "server.js"]
