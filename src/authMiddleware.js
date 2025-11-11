import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { prisma, prismaQuery } from './prismaClient.js';
const JWT_SECRET = process.env.JWT_SECRET || 'your-super-secret-jwt-key-change-in-production';

/**
 * Authentication middleware for Express.js
 */
export class AuthMiddleware {
  /**
   * Verify JWT token and attach user to request
   */
  static async authenticateToken(req, res, next) {
    try {
      const authHeader = req.headers['authorization'];
      const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

      if (!token) {
        return res.status(401).json({
          success: false,
          error: 'Access token required',
          code: 'NO_TOKEN'
        });
      }

      const decoded = jwt.verify(token, JWT_SECRET);
      
      // Get user from database with automatic retry on connection errors
      const user = await prismaQuery(() => prisma.user.findUnique({
        where: { id: decoded.userId },
        select: {
          id: true,
          email: true,
          name: true,
          role: true,
          isPremium: true,
          createdAt: true,
          updatedAt: true
        }
      }));

      if (!user) {
        return res.status(401).json({
          success: false,
          error: 'User not found',
          code: 'USER_NOT_FOUND'
        });
      }

      req.user = user;
      next();
    } catch (error) {
      console.error('Token verification error:', error);
      
      if (error.name === 'JsonWebTokenError') {
        return res.status(401).json({
          success: false,
          error: 'Invalid token',
          code: 'INVALID_TOKEN'
        });
      }
      
      if (error.name === 'TokenExpiredError') {
        return res.status(401).json({
          success: false,
          error: 'Token expired',
          code: 'TOKEN_EXPIRED'
        });
      }

      return res.status(500).json({
        success: false,
        error: 'Token verification failed',
        code: 'TOKEN_VERIFICATION_FAILED'
      });
    }
  }

  /**
   * Require admin role
   */
  static requireAdmin(req, res, next) {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        error: 'Authentication required',
        code: 'AUTH_REQUIRED'
      });
    }

    if (req.user.role !== 'ADMIN') {
      return res.status(403).json({
        success: false,
        error: 'Admin access required',
        code: 'ADMIN_REQUIRED'
      });
    }

    next();
  }

  /**
   * Require student role or higher
   */
  static requireStudent(req, res, next) {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        error: 'Authentication required',
        code: 'AUTH_REQUIRED'
      });
    }

    if (!['STUDENT', 'ADMIN'].includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        error: 'Student access required',
        code: 'STUDENT_REQUIRED'
      });
    }

    next();
  }

  /**
   * Optional authentication - doesn't fail if no token
   */
  static async optionalAuth(req, res, next) {
    try {
      const authHeader = req.headers['authorization'];
      const token = authHeader && authHeader.split(' ')[1];

      if (token) {
        const decoded = jwt.verify(token, JWT_SECRET);
        const user = await prisma.user.findUnique({
          where: { id: decoded.userId },
          select: {
            id: true,
            email: true,
            name: true,
            role: true,
            isPremium: true
          }
        });
        
        if (user) {
          req.user = user;
        }
      }
      
      next();
    } catch (error) {
      // Ignore token errors for optional auth
      next();
    }
  }
}

/**
 * Password utilities
 */
export class PasswordUtils {
  /**
   * Hash password using bcrypt
   */
  static async hashPassword(password) {
    const saltRounds = 12;
    return await bcrypt.hash(password, saltRounds);
  }

  /**
   * Verify password against hash
   */
  static async verifyPassword(password, hash) {
    return await bcrypt.compare(password, hash);
  }

  /**
   * Validate password strength
   */
  static validatePasswordStrength(password) {
    const errors = [];
    
    if (password.length < 8) {
      errors.push('Password must be at least 8 characters long');
    }
    
    if (!/[A-Z]/.test(password)) {
      errors.push('Password must contain at least one uppercase letter');
    }
    
    if (!/[a-z]/.test(password)) {
      errors.push('Password must contain at least one lowercase letter');
    }
    
    if (!/\d/.test(password)) {
      errors.push('Password must contain at least one number');
    }
    
    if (!/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password)) {
      errors.push('Password must contain at least one special character');
    }
    
    return {
      isValid: errors.length === 0,
      errors
    };
  }
}

/**
 * JWT utilities
 */
export class JWTUtils {
  /**
   * Generate JWT token
   */
  static generateToken(user) {
    const payload = {
      userId: user.id,
      email: user.email,
      role: user.role,
      isPremium: user.isPremium
    };

    return jwt.sign(payload, JWT_SECRET, {
      expiresIn: '7d', // Token expires in 7 days
      issuer: 'dappdojo-backend',
      audience: 'dappdojo-frontend'
    });
  }

  /**
   * Generate refresh token
   */
  static generateRefreshToken(user) {
    const payload = {
      userId: user.id,
      type: 'refresh'
    };

    return jwt.sign(payload, JWT_SECRET, {
      expiresIn: '30d', // Refresh token expires in 30 days
      issuer: 'dappdojo-backend',
      audience: 'dappdojo-frontend'
    });
  }

  /**
   * Verify refresh token
   */
  static verifyRefreshToken(token) {
    try {
      const decoded = jwt.verify(token, JWT_SECRET);
      if (decoded.type !== 'refresh') {
        throw new Error('Invalid token type');
      }
      return decoded;
    } catch (error) {
      throw new Error('Invalid refresh token');
    }
  }
}
