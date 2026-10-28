FROM node:22-bookworm-slim AS build
WORKDIR /app
COPY package*.json ./
COPY scripts ./scripts
RUN npm ci
COPY . .
ENV EXPO_NO_TELEMETRY=1
RUN npx expo export --platform web --output-dir dist
FROM nginx:1.28-alpine
COPY deploy/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
