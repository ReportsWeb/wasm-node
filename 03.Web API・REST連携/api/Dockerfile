FROM node:22-alpine AS build
WORKDIR /work
COPY package*.json ./
RUN npm ci
COPY tsconfig.json ./
COPY src/ src/
RUN npm run build && npm prune --omit=dev
FROM node:22-alpine
WORKDIR /opt/reports/sample
COPY --from=build --chown=node:node /work/package*.json ./
COPY --from=build --chown=node:node /work/node_modules/ node_modules/
COPY --from=build --chown=node:node /work/dist/ dist/
COPY --chown=node:node public/ public/
COPY --chown=node:node resources/ /opt/reports/resources/
USER node
ENV HOST=0.0.0.0 PORT=8080 REPORTS_RESOURCE_ROOT=/opt/reports/resources REPORTS_WEB_ROOT=/opt/reports/web
EXPOSE 8080
CMD ["node", "--max-old-space-size=256", "dist/server.js"]
