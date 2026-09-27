# The website: build the static site with Bun, serve it with nginx.
#   docker build -t ai-interviewer-web \
#     --build-arg VITE_BACKEND_URL=https://api.example.com --build-arg VITE_SITE_URL=https://example.com frontend
FROM oven/bun:1 AS build
WORKDIR /app
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile
COPY . .
ARG VITE_BACKEND_URL
ARG VITE_SITE_URL
ARG VITE_CONTACT_EMAIL
ENV VITE_BACKEND_URL=$VITE_BACKEND_URL VITE_SITE_URL=$VITE_SITE_URL VITE_CONTACT_EMAIL=$VITE_CONTACT_EMAIL
RUN bun run build

FROM nginx:1.27-alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
# Not a public file: nginx.conf includes it from /etc/nginx.
RUN mv /usr/share/nginx/html/nginx-headers.conf /etc/nginx/nginx-headers.conf
EXPOSE 80
