# ================================
# Build Stage
# ================================
FROM node:20-alpine AS builder

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install ALL dependencies (including devDependencies for TypeScript build)
RUN npm install --frozen-lockfile || npm install

# Copy source code
COPY . .

# Build TypeScript
RUN npm run build

# ================================
# Production Stage
# ================================
FROM node:20-alpine AS runner

WORKDIR /app

# Copy package files and install production only
COPY package*.json ./
RUN npm install --omit=dev && npm cache clean --force

# Copy built files from builder
COPY --from=builder /app/dist ./dist

# Copy views (EJS templates)
COPY --from=builder /app/src/views ./dist/views

# Create uploads directory
RUN mkdir -p uploads/temp uploads/documents

# Create non-root user for security
RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 expressjs

# Change ownership of uploads directory
RUN chown -R expressjs:nodejs uploads

USER expressjs

# Environment
ENV NODE_ENV=production
ENV PORT=5000

EXPOSE 5000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=10s --retries=3 \
    CMD wget --no-verbose --tries=1 --spider http://localhost:5000/health || exit 1

CMD ["node", "dist/server.js"]
