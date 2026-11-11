# Stage 1: Build
FROM node:18-alpine as build-stage
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .

RUN npm run build

# Stage 2: Serve
FROM nginx:stable-alpine as production-stage
COPY --from=build-stage /app/dist /usr/share/nginx/html
# Site, /api, /push e /socket.io no mesmo endereço (o docker compose monta este mesmo arquivo)
COPY nginx.docker.conf /etc/nginx/conf.d/default.conf
# HTTPS local com certificado autoassinado (gerado na subida do container, sem depender da internet)
RUN apk add --no-cache openssl
COPY docker/10-selfsigned-cert.sh /docker-entrypoint.d/10-selfsigned-cert.sh
RUN sed -i 's/\r$//' /docker-entrypoint.d/10-selfsigned-cert.sh && chmod +x /docker-entrypoint.d/10-selfsigned-cert.sh
EXPOSE 8080 8081 8443
CMD ["nginx", "-g", "daemon off;"]
