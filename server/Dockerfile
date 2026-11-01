# 后端镜像：Node 20（slim 为 glibc，better-sqlite3 有预编译二进制，无需编译环境）
FROM node:20-slim

WORKDIR /app

# 先装依赖，利用 Docker 层缓存
COPY package*.json ./
RUN npm install --omit=dev

COPY . .

ENV NODE_ENV=production
ENV PORT=8080

# 数据与上传文件目录（可挂载卷持久化）
VOLUME ["/app/data", "/app/uploads"]

EXPOSE 8080
CMD ["node", "src/index.js"]
