from node:22-slim

WORKDIR /app

RUN apt-get update -y && \
    apt-get install -y openssl && \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/*

COPY package*.json ./
COPY pnpm-lock.yaml ./
COPY prisma ./prisma/

RUN npm install -g pnpm
RUN pnpm install

RUN npx prisma generate

COPY tessdata ./tessdata

COPY . .

RUN pnpm run build

EXPOSE 3000

CMD ["pnpm", "run", "start:dev"]