# Use Node.js 18 Debian-based image for Foundry compatibility
# Foundry requires glibc which is not available in Alpine (musl)
FROM node:18

# Install system dependencies required for Foundry
RUN apt-get update && apt-get install -y \
    git \
    curl \
    build-essential \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Install Foundry
# The installer exits with code 1 due to shell detection in Docker, but still installs foundryup
# We ignore the exit code and then explicitly run foundryup
RUN mkdir -p /root/.foundry/bin && \
    (curl -L https://foundry.paradigm.xyz | bash || true) && \
    (test -f /root/.foundry/bin/foundryup && chmod +x /root/.foundry/bin/foundryup && /root/.foundry/bin/foundryup || echo "Warning: foundryup not found, trying alternative installation")
ENV PATH="/root/.foundry/bin:$PATH"

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install all dependencies (including dev dependencies for Prisma CLI)
RUN npm ci

# Copy application code
COPY . .

# Generate Prisma client (required at runtime)
RUN npx prisma generate

# Remove dev dependencies to reduce image size (keep only production)
RUN npm prune --production

# Create necessary directories
RUN mkdir -p /tmp/foundry-cache /tmp/foundry-out /tmp/student-workspaces

# Set proper permissions
RUN chmod +x index.js

# Expose port
EXPOSE 3002

# Health check
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD curl -f http://localhost:3002/health || exit 1

# Start the application
CMD ["npm", "start"]