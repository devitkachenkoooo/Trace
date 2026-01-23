# Використовуємо офіційний образ Node.js
FROM node:22-alpine

# Встановлюємо конкретну версію pnpm, як у твоєму package.json
RUN npm install -g pnpm@10.28.1

# Встановлюємо робочу директорію всередині контейнера
WORKDIR /app

# Копіюємо файли конфігурації
COPY package.json pnpm-lock.yaml .npmrc ./

# Встановлюємо залежності (використовуємо frozen-lockfile згідно з док)
RUN pnpm install --frozen-lockfile

# Копіюємо весь інший код проекту
COPY . .

# Відкриваємо порт для Next.js
EXPOSE 3000

# Запускаємо проект у дев-режимі
CMD ["pnpm", "dev"]