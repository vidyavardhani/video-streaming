# Video Streaming (EduMeet) - Production image
FROM node:20-alpine AS base

WORKDIR /app

# # Install dependencies (production only in final stage)
# FROM base AS deps
# COPY package.json package-lock.json* ./
# RUN npm ci --omit=dev 2>/dev/null || npm install --omit=dev

FROM base AS deps
COPY package.json package-lock.json* ./
RUN npm ci --omit=dev 2>/dev/null || npm install --omit=dev

# Copy source and run as non-root
FROM base AS runner
# ENV NODE_ENV=production
# ENV NODE_ENV=staging
ENV NODE_ENV=development
RUN addgroup -g 1001 -S nodejs && adduser -S app -u 1001 -G nodejs

# Copy package files first so npm install has a manifest
COPY package.json package-lock.json* ./
RUN npm install

COPY . .

# Chown app files
RUN chown -R app:nodejs /app
USER app

EXPOSE 4000
ENV PORT=4000

CMD ["npm", "start"]
