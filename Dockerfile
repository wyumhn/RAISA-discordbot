FROM node:22-alpine

ENV NODE_ENV=production
WORKDIR /app

# 依存パッケージだけ先に入れる（ソース変更時にキャッシュを使えるように）
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY src ./src

# root ではなく node ユーザーで動かす
RUN mkdir -p data && chown node:node data
USER node

VOLUME ["/app/data"]

# 停止時は SIGTERM → Bot 側で Discord から切断してから終了
STOPSIGNAL SIGTERM
CMD ["node", "src/index.js"]
