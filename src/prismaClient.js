import { PrismaClient } from '@prisma/client';

// Configure connection URL with pooling and SSL parameters
function buildPrismaUrl() {
  const baseUrl = process.env.DATABASE_URL;
  if (!baseUrl) return baseUrl;
  
  // Check if URL already has parameters
  const hasParams = baseUrl.includes('?');
  const separator = hasParams ? '&' : '?';
  
  // Build parameter string
  const params = new URLSearchParams();
  
  // Add connection parameters (only if not already present)
  if (!baseUrl.includes('connection_limit=')) {
    params.append('connection_limit', '5');
  }
  if (!baseUrl.includes('pool_timeout=')) {
    params.append('pool_timeout', '20');
  }
  if (!baseUrl.includes('connect_timeout=')) {
    params.append('connect_timeout', '10');
  }
  if (!baseUrl.includes('statement_cache_size=')) {
    params.append('statement_cache_size', '0');
  }
  
  // Add SSL parameters for Fly.io PostgreSQL (required for TLS connections)
  if (!baseUrl.includes('sslmode=')) {
    params.append('sslmode', 'require');
  }
  
  const paramString = params.toString();
  return paramString ? `${baseUrl}${separator}${paramString}` : baseUrl;
}

const prismaUrl = buildPrismaUrl();

// Create Prisma client with optimized settings
const prisma = new PrismaClient({
  log: process.env.NODE_ENV === 'production' ? ['error'] : ['query', 'error', 'warn'],
  datasources: {
    db: {
      url: prismaUrl
    }
  },
  errorFormat: 'pretty'
});

// Connection state tracking
let isConnected = false;
let reconnectAttempts = 0;
const maxReconnectAttempts = 10;
let reconnectTimer = null;

/**
 * Reconnect to database with exponential backoff
 */
async function reconnectPrisma() {
  if (reconnectAttempts >= maxReconnectAttempts) {
    console.error('❌ Max Prisma reconnection attempts reached. Please check database status.');
    return false;
  }
  
  try {
    reconnectAttempts++;
    const backoffDelay = Math.min(1000 * Math.pow(2, reconnectAttempts - 1), 10000); // Max 10 seconds
    console.log(`🔄 Attempting to reconnect Prisma (attempt ${reconnectAttempts}/${maxReconnectAttempts}) after ${backoffDelay}ms...`);
    
    // Disconnect first to clean up any stale connections
    try {
      await prisma.$disconnect();
    } catch (e) {
      // Ignore disconnect errors
    }
    
    // Wait before reconnecting
    await new Promise(resolve => setTimeout(resolve, backoffDelay));
    
    // Reconnect
    await prisma.$connect();
    isConnected = true;
    reconnectAttempts = 0;
    console.log('✅ Prisma reconnected successfully');
    return true;
  } catch (error) {
    console.error(`❌ Prisma reconnection failed (attempt ${reconnectAttempts}):`, error.message);
    isConnected = false;
    
    // Schedule next retry
    if (reconnectAttempts < maxReconnectAttempts) {
      reconnectTimer = setTimeout(reconnectPrisma, 2000);
    }
    return false;
  }
}

/**
 * Execute a Prisma query with automatic retry on connection errors
 */
export async function prismaQuery(queryFn, retries = 3) {
  for (let i = 0; i <= retries; i++) {
    try {
      // Ensure connection is active
      if (!isConnected) {
        await reconnectPrisma();
      }
      
      return await queryFn();
    } catch (error) {
      // Check if it's a connection error
      const isConnectionError = 
        error.code === 'P1017' || 
        error.code === 'P1001' ||
        error.message?.includes('Server has closed the connection') ||
        error.message?.includes('Connection closed') ||
        error.message?.includes('Connection terminated') ||
        error.message?.includes('unexpected EOF') ||
        error.message?.includes('read-only transaction');
      
      if (isConnectionError && i < retries) {
        console.log(`⚠️  Database connection error, attempting reconnect (retry ${i + 1}/${retries})...`);
        isConnected = false;
        const reconnected = await reconnectPrisma();
        if (reconnected) {
          // Wait a bit before retrying
          await new Promise(resolve => setTimeout(resolve, 500));
          continue;
        }
      }
      
      // If not a connection error or max retries reached, throw
      throw error;
    }
  }
}

/**
 * Initialize and test database connection
 */
export async function initializePrisma() {
  try {
    await prisma.$connect();
    isConnected = true;
    console.log('✅ Database connection successful');
    
    // Test query to verify connection
    await prisma.$queryRaw`SELECT 1`;
    console.log('✅ Database connection verified');
    
    return true;
  } catch (error) {
    console.error('❌ Database connection failed:', error.message);
    isConnected = false;
    // Attempt reconnection in background
    reconnectPrisma();
    return false;
  }
}

/**
 * Gracefully disconnect from database
 */
export async function disconnectPrisma() {
  try {
    if (reconnectTimer) {
      clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }
    await prisma.$disconnect();
    isConnected = false;
    console.log('✅ Database disconnected');
  } catch (error) {
    console.error('❌ Error disconnecting from database:', error.message);
  }
}

// Initialize on module load
initializePrisma();

// Handle process exit
process.on('beforeExit', disconnectPrisma);
process.on('SIGINT', disconnectPrisma);
process.on('SIGTERM', disconnectPrisma);

// Export the Prisma client
// Note: Use prismaQuery() wrapper for automatic retry, or use prisma directly if you handle errors yourself
export { prisma };
export default prisma;

