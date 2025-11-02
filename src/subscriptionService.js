import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

/**
 * Subscription Service for managing paid plans
 * Handles subscription registration, updates, and status management
 */
export class SubscriptionService {
  /**
   * Register or update a user's paid plan
   * Called by Stripe webhook when payment is successful
   * 
   * @param {string} userId - User ID
   * @param {Object} subscriptionData - Subscription data from Stripe
   * @param {string} subscriptionData.plan - 'MONTHLY' or 'YEARLY'
   * @param {Date} subscriptionData.startsAt - Subscription start date
   * @param {Date} subscriptionData.endsAt - Subscription end date
   * @param {string} subscriptionData.stripeSubscriptionId - Stripe subscription ID
   * @returns {Promise<Object>} Success or failure response
   */
  static async registerPaidPlan(userId, subscriptionData) {
    try {
      const { plan, startsAt, endsAt, stripeSubscriptionId } = subscriptionData;

      // Validate required fields
      if (!userId || !plan || !startsAt || !endsAt) {
        return {
          success: false,
          error: 'Missing required subscription fields',
          code: 'MISSING_FIELDS'
        };
      }

      // Validate plan type
      if (plan !== 'MONTHLY' && plan !== 'YEARLY') {
        return {
          success: false,
          error: 'Invalid plan type. Must be MONTHLY or YEARLY',
          code: 'INVALID_PLAN'
        };
      }

      // Validate dates
      if (new Date(startsAt) >= new Date(endsAt)) {
        return {
          success: false,
          error: 'Start date must be before end date',
          code: 'INVALID_DATES'
        };
      }

      // Check if user exists
      const user = await prisma.user.findUnique({
        where: { id: userId }
      });

      if (!user) {
        return {
          success: false,
          error: 'User not found',
          code: 'USER_NOT_FOUND'
        };
      }

      // Update user subscription
      const updatedUser = await prisma.user.update({
        where: { id: userId },
        data: {
          subscriptionPlan: plan,
          subscriptionStatus: 'ACTIVE',
          isPremium: true,
          subscriptionStartsAt: new Date(startsAt),
          subscriptionEndsAt: new Date(endsAt),
          stripeSubscriptionId: stripeSubscriptionId || user.stripeSubscriptionId,
          updatedAt: new Date()
        },
        select: {
          id: true,
          email: true,
          subscriptionPlan: true,
          subscriptionStatus: true,
          isPremium: true,
          subscriptionStartsAt: true,
          subscriptionEndsAt: true
        }
      });

      return {
        success: true,
        message: 'Paid plan registered successfully',
        user: updatedUser
      };
    } catch (error) {
      console.error('Register paid plan error:', error);
      return {
        success: false,
        error: 'Failed to register paid plan',
        code: 'REGISTRATION_FAILED',
        details: error.message
      };
    }
  }

  /**
   * Cancel a user's subscription
   * Called when subscription is canceled or expires
   * 
   * @param {string} userId - User ID (optional, can use stripeSubscriptionId instead)
   * @param {string} stripeSubscriptionId - Stripe subscription ID (optional)
   * @returns {Promise<Object>} Success or failure response
   */
  static async cancelSubscription(userId = null, stripeSubscriptionId = null) {
    try {
      if (!userId && !stripeSubscriptionId) {
        return {
          success: false,
          error: 'Either userId or stripeSubscriptionId is required',
          code: 'MISSING_IDENTIFIER'
        };
      }

      const where = userId 
        ? { id: userId }
        : { stripeSubscriptionId: stripeSubscriptionId };

      const user = await prisma.user.findUnique({
        where: where
      });

      if (!user) {
        return {
          success: false,
          error: 'User not found',
          code: 'USER_NOT_FOUND'
        };
      }

      // Update subscription status
      const updatedUser = await prisma.user.update({
        where: { id: user.id },
        data: {
          subscriptionStatus: 'CANCELED',
          isPremium: false,
          subscriptionEndsAt: new Date(), // Set end date to now
          updatedAt: new Date()
        },
        select: {
          id: true,
          email: true,
          subscriptionPlan: true,
          subscriptionStatus: true,
          isPremium: true,
          subscriptionStartsAt: true,
          subscriptionEndsAt: true
        }
      });

      return {
        success: true,
        message: 'Subscription canceled successfully',
        user: updatedUser
      };
    } catch (error) {
      console.error('Cancel subscription error:', error);
      return {
        success: false,
        error: 'Failed to cancel subscription',
        code: 'CANCEL_FAILED',
        details: error.message
      };
    }
  }

  /**
   * Update subscription status (e.g., PAST_DUE, ACTIVE)
   * 
   * @param {string} userId - User ID (optional)
   * @param {string} stripeSubscriptionId - Stripe subscription ID (optional)
   * @param {string} status - New subscription status
   * @returns {Promise<Object>} Success or failure response
   */
  static async updateSubscriptionStatus(userId = null, stripeSubscriptionId = null, status) {
    try {
      if (!userId && !stripeSubscriptionId) {
        return {
          success: false,
          error: 'Either userId or stripeSubscriptionId is required',
          code: 'MISSING_IDENTIFIER'
        };
      }

      if (!status) {
        return {
          success: false,
          error: 'Status is required',
          code: 'MISSING_STATUS'
        };
      }

      const validStatuses = ['ACTIVE', 'INACTIVE', 'CANCELED', 'PAST_DUE', 'TRIALING'];
      if (!validStatuses.includes(status)) {
        return {
          success: false,
          error: `Invalid status. Must be one of: ${validStatuses.join(', ')}`,
          code: 'INVALID_STATUS'
        };
      }

      const where = userId 
        ? { id: userId }
        : { stripeSubscriptionId: stripeSubscriptionId };

      const user = await prisma.user.findUnique({
        where: where
      });

      if (!user) {
        return {
          success: false,
          error: 'User not found',
          code: 'USER_NOT_FOUND'
        };
      }

      // Update status and isPremium based on status
      const isPremium = status === 'ACTIVE' || status === 'TRIALING';

      const updatedUser = await prisma.user.update({
        where: { id: user.id },
        data: {
          subscriptionStatus: status,
          isPremium: isPremium,
          updatedAt: new Date()
        },
        select: {
          id: true,
          email: true,
          subscriptionPlan: true,
          subscriptionStatus: true,
          isPremium: true,
          subscriptionStartsAt: true,
          subscriptionEndsAt: true
        }
      });

      return {
        success: true,
        message: 'Subscription status updated successfully',
        user: updatedUser
      };
    } catch (error) {
      console.error('Update subscription status error:', error);
      return {
        success: false,
        error: 'Failed to update subscription status',
        code: 'UPDATE_FAILED',
        details: error.message
      };
    }
  }

  /**
   * Check if a user has an active paid plan
   * 
   * @param {string} userId - User ID
   * @returns {Promise<Object>} Check result with subscription details
   */
  static async hasActivePaidPlan(userId) {
    try {
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: {
          id: true,
          subscriptionPlan: true,
          subscriptionStatus: true,
          isPremium: true,
          subscriptionStartsAt: true,
          subscriptionEndsAt: true
        }
      });

      if (!user) {
        return {
          success: false,
          hasActivePlan: false,
          error: 'User not found',
          code: 'USER_NOT_FOUND'
        };
      }

      const now = new Date();
      const isActive = 
        user.isPremium &&
        user.subscriptionStatus === 'ACTIVE' &&
        user.subscriptionPlan !== 'FREE' &&
        (!user.subscriptionEndsAt || new Date(user.subscriptionEndsAt) > now);

      return {
        success: true,
        hasActivePlan: isActive,
        subscription: {
          plan: user.subscriptionPlan,
          status: user.subscriptionStatus,
          isPremium: user.isPremium,
          startsAt: user.subscriptionStartsAt,
          endsAt: user.subscriptionEndsAt
        }
      };
    } catch (error) {
      console.error('Check active paid plan error:', error);
      return {
        success: false,
        hasActivePlan: false,
        error: 'Failed to check subscription status',
        code: 'CHECK_FAILED',
        details: error.message
      };
    }
  }

  /**
   * Calculate subscription end date based on plan type and start date
   * 
   * @param {string} plan - 'MONTHLY' or 'YEARLY'
   * @param {Date} startDate - Subscription start date
   * @returns {Date} Calculated end date
   */
  static calculateEndDate(plan, startDate) {
    const start = new Date(startDate);
    const end = new Date(start);

    if (plan === 'MONTHLY') {
      end.setMonth(end.getMonth() + 1);
    } else if (plan === 'YEARLY') {
      end.setFullYear(end.getFullYear() + 1);
    }

    return end;
  }
}

