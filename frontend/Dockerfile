# Stage 1: Dependencies & Build
FROM node:22-alpine AS builder
WORKDIR /app

COPY package.json ./
COPY frontend/package.json ./frontend/
RUN npm install

COPY frontend ./frontend
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm --workspace=frontend run build

# Stage 2: Production Runner
FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

RUN addgroup --system --gid 1001 cbtgroup && \
    adduser --system --uid 1001 cbtuser

COPY --from=builder /app/package.json ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/frontend/package.json ./frontend/package.json
COPY --from=builder /app/frontend/.next ./frontend/.next
COPY --from=builder /app/frontend/public ./frontend/public

USER cbtuser
EXPOSE 3000
CMD ["npm", "--workspace=frontend", "run", "start"]
