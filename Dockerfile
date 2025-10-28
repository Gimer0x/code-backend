# Use Node.js 18 Alpine for smaller image size
FROM node:18-alpine

# Install system dependencies required for Foundry
RUN apk add --no-cache \
    git \
    curl \
    bash \
    gcc \
    musl-dev \
    openssl-dev \
    pkgconfig

# Install Foundry
RUN curl -L https://foundry.paradigm.xyz | bash
ENV PATH="/root/.foundry/bin:$PATH"
RUN foundryup

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install Node.js dependencies
RUN npm ci --only=production

# Copy application code
COPY . .

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