FROM node:20-alpine

WORKDIR /app

# Install dependencies
COPY package.json package-lock.json ./
RUN npm ci

# Copy source files
COPY . .

# Generate Prisma Client
RUN npx prisma generate

# Build Next.js
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

# Copy static files needed by standalone
RUN cp -r public .next/standalone/public && cp -r .next/static .next/standalone/.next/static

# Run db push and start the standalone server
CMD ["sh", "-c", "npx prisma db push --accept-data-loss && cd .next/standalone && node server.js"]
