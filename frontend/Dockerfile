# syntax=docker/dockerfile:1.7
FROM node:24-alpine AS build
WORKDIR /src

COPY package.json package-lock.json* ./
RUN npm ci

COPY . .
RUN npx ng build --configuration=production

FROM nginx:1.27-alpine AS runtime
COPY infra/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /src/dist/frontend/browser /usr/share/nginx/html
EXPOSE 80
