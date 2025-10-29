import { PrismaClient } from '@prisma/client';
import { PasswordUtils, JWTUtils } from './authMiddleware.js';

const prisma = new PrismaClient();

/**
 * Authentication service for user management
 */
export class AuthService {
  /**
   * Register a new user
   */
  static async register(userData) {
    try {
      const { email, password, name, role = 'STUDENT' } = userData;

      // Validate required fields
      if (!email || !password) {
        return {
          success: false,
          error: 'Email and password are required',
          code: 'MISSING_FIELDS'
        };
      }

      // Validate password strength
      const passwordValidation = PasswordUtils.validatePasswordStrength(password);
      if (!passwordValidation.isValid) {
        return {
          success: false,
          error: 'Password does not meet requirements',
          code: 'WEAK_PASSWORD',
          details: passwordValidation.errors
        };
      }

      // Check if user already exists
      const existingUser = await prisma.user.findUnique({
        where: { email: email.toLowerCase() }
      });

      if (existingUser) {
        return {
          success: false,
          error: 'User with this email already exists',
          code: 'USER_EXISTS'
        };
      }

      // Hash password
      const hashedPassword = await PasswordUtils.hashPassword(password);

      // Create user
      const user = await prisma.user.create({
        data: {
          email: email.toLowerCase(),
          password: hashedPassword,
          name: name || null,
          role: role.toUpperCase(),
          isPremium: false
        },
        select: {
          id: true,
          email: true,
          name: true,
          role: true,
          isPremium: true,
          createdAt: true,
          updatedAt: true
        }
      });

      // Generate tokens
      const accessToken = JWTUtils.generateToken(user);
      const refreshToken = JWTUtils.generateRefreshToken(user);

      return {
        success: true,
        user,
        accessToken,
        refreshToken,
        message: 'User registered successfully'
      };

    } catch (error) {
      console.error('Registration error:', error);
      return {
        success: false,
        error: 'Registration failed',
        code: 'REGISTRATION_FAILED'
      };
    }
  }

  /**
   * Login user
   */
  static async login(credentials) {
    try {
      const { email, password } = credentials;

      if (!email || !password) {
        return {
          success: false,
          error: 'Email and password are required',
          code: 'MISSING_CREDENTIALS'
        };
      }

      // Find user by email
      const user = await prisma.user.findUnique({
        where: { email: email.toLowerCase() }
      });

      if (!user) {
        return {
          success: false,
          error: 'Invalid email or password',
          code: 'INVALID_CREDENTIALS'
        };
      }

      // Check if user has a password (not OAuth user)
      if (!user.password) {
        return {
          success: false,
          error: 'Please use social login for this account',
          code: 'SOCIAL_LOGIN_REQUIRED'
        };
      }

      // Verify password
      const isValidPassword = await PasswordUtils.verifyPassword(password, user.password);
      if (!isValidPassword) {
        return {
          success: false,
          error: 'Invalid email or password',
          code: 'INVALID_CREDENTIALS'
        };
      }

      // Update last login (optional)
      await prisma.user.update({
        where: { id: user.id },
        data: { updatedAt: new Date() }
      });

      // Prepare user data (exclude password)
      const userData = {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        isPremium: user.isPremium,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt
      };

      // Generate tokens
      const accessToken = JWTUtils.generateToken(userData);
      const refreshToken = JWTUtils.generateRefreshToken(userData);

      return {
        success: true,
        user: userData,
        accessToken,
        refreshToken,
        message: 'Login successful'
      };

    } catch (error) {
      console.error('Login error:', error);
      return {
        success: false,
        error: 'Login failed',
        code: 'LOGIN_FAILED'
      };
    }
  }

  /**
   * Refresh access token
   */
  static async refreshToken(refreshToken) {
    try {
      if (!refreshToken) {
        return {
          success: false,
          error: 'Refresh token required',
          code: 'NO_REFRESH_TOKEN'
        };
      }

      // Verify refresh token
      const decoded = JWTUtils.verifyRefreshToken(refreshToken);
      
      // Get user from database
      const user = await prisma.user.findUnique({
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
      });

      if (!user) {
        return {
          success: false,
          error: 'User not found',
          code: 'USER_NOT_FOUND'
        };
      }

      // Generate new tokens
      const newAccessToken = JWTUtils.generateToken(user);
      const newRefreshToken = JWTUtils.generateRefreshToken(user);

      return {
        success: true,
        user,
        accessToken: newAccessToken,
        refreshToken: newRefreshToken,
        message: 'Token refreshed successfully'
      };

    } catch (error) {
      console.error('Token refresh error:', error);
      return {
        success: false,
        error: 'Token refresh failed',
        code: 'REFRESH_FAILED'
      };
    }
  }

  /**
   * Get user profile
   */
  static async getUserProfile(userId) {
    try {
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: {
          id: true,
          email: true,
          name: true,
          role: true,
          isPremium: true,
          photoUrl: true,
          createdAt: true,
          updatedAt: true,
          subscriptionPlan: true,
          subscriptionStatus: true,
          trialEndsAt: true,
          subscriptionEndsAt: true
        }
      });

      if (!user) {
        return {
          success: false,
          error: 'User not found',
          code: 'USER_NOT_FOUND'
        };
      }

      return {
        success: true,
        user,
        message: 'Profile retrieved successfully'
      };

    } catch (error) {
      console.error('Get profile error:', error);
      return {
        success: false,
        error: 'Failed to get profile',
        code: 'PROFILE_FAILED'
      };
    }
  }

  /**
   * Update user profile
   */
  static async updateProfile(userId, updateData) {
    try {
      const { name, photoUrl } = updateData;

      const user = await prisma.user.update({
        where: { id: userId },
        data: {
          ...(name && { name }),
          ...(photoUrl && { photoUrl })
        },
        select: {
          id: true,
          email: true,
          name: true,
          role: true,
          isPremium: true,
          photoUrl: true,
          createdAt: true,
          updatedAt: true
        }
      });

      return {
        success: true,
        user,
        message: 'Profile updated successfully'
      };

    } catch (error) {
      console.error('Update profile error:', error);
      return {
        success: false,
        error: 'Failed to update profile',
        code: 'UPDATE_FAILED'
      };
    }
  }

  /**
   * Change password
   */
  static async changePassword(userId, passwordData) {
    try {
      const { currentPassword, newPassword } = passwordData;

      if (!currentPassword || !newPassword) {
        return {
          success: false,
          error: 'Current password and new password are required',
          code: 'MISSING_PASSWORDS'
        };
      }

      // Get user with password
      const user = await prisma.user.findUnique({
        where: { id: userId }
      });

      if (!user || !user.password) {
        return {
          success: false,
          error: 'User not found or no password set',
          code: 'USER_NOT_FOUND'
        };
      }

      // Verify current password
      const isValidCurrentPassword = await PasswordUtils.verifyPassword(currentPassword, user.password);
      if (!isValidCurrentPassword) {
        return {
          success: false,
          error: 'Current password is incorrect',
          code: 'INVALID_CURRENT_PASSWORD'
        };
      }

      // Validate new password strength
      const passwordValidation = PasswordUtils.validatePasswordStrength(newPassword);
      if (!passwordValidation.isValid) {
        return {
          success: false,
          error: 'New password does not meet requirements',
          code: 'WEAK_PASSWORD',
          details: passwordValidation.errors
        };
      }

      // Hash new password
      const hashedNewPassword = await PasswordUtils.hashPassword(newPassword);

      // Update password
      await prisma.user.update({
        where: { id: userId },
        data: { password: hashedNewPassword }
      });

      return {
        success: true,
        message: 'Password changed successfully'
      };

    } catch (error) {
      console.error('Change password error:', error);
      return {
        success: false,
        error: 'Failed to change password',
        code: 'CHANGE_PASSWORD_FAILED'
      };
    }
  }

  /**
   * Create admin user (for initialization)
   */
  static async createAdminUser(adminData) {
    try {
      const { email, password, name = 'Admin User' } = adminData;

      if (!email || !password) {
        return {
          success: false,
          error: 'Email and password are required',
          code: 'MISSING_FIELDS'
        };
      }

      // Check if admin already exists
      const existingAdmin = await prisma.user.findFirst({
        where: { role: 'ADMIN' }
      });

      if (existingAdmin) {
        return {
          success: false,
          error: 'Admin user already exists',
          code: 'ADMIN_EXISTS'
        };
      }

      // Validate password strength
      const passwordValidation = PasswordUtils.validatePasswordStrength(password);
      if (!passwordValidation.isValid) {
        return {
          success: false,
          error: 'Password does not meet requirements',
          code: 'WEAK_PASSWORD',
          details: passwordValidation.errors
        };
      }

      // Hash password
      const hashedPassword = await PasswordUtils.hashPassword(password);

      // Create admin user
      const admin = await prisma.user.create({
        data: {
          email: email.toLowerCase(),
          password: hashedPassword,
          name,
          role: 'ADMIN',
          isPremium: true
        },
        select: {
          id: true,
          email: true,
          name: true,
          role: true,
          isPremium: true,
          createdAt: true,
          updatedAt: true
        }
      });

      return {
        success: true,
        user: admin,
        message: 'Admin user created successfully'
      };

    } catch (error) {
      console.error('Create admin error:', error);
      return {
        success: false,
        error: 'Failed to create admin user',
        code: 'CREATE_ADMIN_FAILED'
      };
    }
  }
}
