-- Migration: Add subscriptionStartsAt column to users table
-- Run this SQL manually with a database user that has ALTER TABLE permissions

ALTER TABLE "users" 
ADD COLUMN IF NOT EXISTS "subscriptionStartsAt" TIMESTAMP(3);

-- This column is nullable and has no default, matching the Prisma schema

