# ============================================================
# FolhaPronta Admin — Multi-stage build (Vite + Nginx)
# ============================================================
# Stage 1: Build do bundle Vite
FROM node:20-alpine AS build
WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm ci --silent

COPY . .

# `VITE_API_URL` precisa ser definido em BUILD TIME — Vite inlinea env vars
# `VITE_*` no bundle final. Sem isso o admin tenta bater em https://localhost:7166.
ARG VITE_API_URL
ENV VITE_API_URL=$VITE_API_URL

RUN npm run build

# ============================================================
# Stage 2: Nginx servindo o bundle estático
FROM nginx:alpine AS runtime

RUN rm /etc/nginx/conf.d/default.conf
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html

EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
