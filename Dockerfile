# 一体化镜像：构建前端静态产物 + 运行后端，由后端同时托管页面与 /api
# 适用于 Railway / 任意容器平台（单服务、单域名，无需 CORS）
FROM node:20-slim AS web-build
WORKDIR /web
COPY web/package*.json ./
RUN npm ci --no-audit --no-fund 2>/dev/null || npm install --no-audit --no-fund
COPY web/ ./
# 留空即同源，前端将请求 /api
ENV VITE_API_BASE_URL=""
RUN npm run build

FROM node:20-slim
WORKDIR /app
COPY server/package*.json ./
RUN npm install --omit=dev --no-audit --no-fund
COPY server/ ./
COPY --from=web-build /web/dist /app/web-dist

ENV NODE_ENV=production
ENV PORT=8080
ENV WEB_DIST=/app/web-dist

VOLUME ["/app/data", "/app/uploads"]
EXPOSE 8080
CMD ["node", "src/index.js"]
