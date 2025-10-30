# Frontend Authentication Integration Guide

This guide provides all the information needed to implement authentication in your frontend application.

## 🔐 Authentication System Overview

The backend uses **JWT (JSON Web Tokens)** for authentication with the following features:
- **Access Tokens**: 7-day expiration, used for API requests
- **Refresh Tokens**: 30-day expiration, used to get new access tokens
- **Password Hashing**: bcrypt with 12 salt rounds
- **Role-based Access**: ADMIN and STUDENT roles
- **Password Validation**: Strong password requirements

## 📡 API Endpoints

### Base URL
```
http://localhost:3002
```

### Authentication Endpoints

#### 1. Register User
```http
POST /api/auth/register
Content-Type: application/json

{
  "email": "user@example.com",
  "password": "SecurePass123!",
  "name": "John Doe",
  "role": "STUDENT" // Optional, defaults to STUDENT
}
```

**Response:**
```json
{
  "success": true,
  "user": {
    "id": "user_id",
    "email": "user@example.com",
    "name": "John Doe",
    "role": "STUDENT",
    "isPremium": false,
    "createdAt": "2025-01-01T00:00:00.000Z",
    "updatedAt": "2025-01-01T00:00:00.000Z"
  },
  "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "refreshToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "message": "User registered successfully"
}
```

#### 2. Login User
```http
POST /api/auth/login
Content-Type: application/json

{
  "email": "user@example.com",
  "password": "SecurePass123!"
}
```

**Response:**
```json
{
  "success": true,
  "user": {
    "id": "user_id",
    "email": "user@example.com",
    "name": "John Doe",
    "role": "STUDENT",
    "isPremium": false,
    "createdAt": "2025-01-01T00:00:00.000Z",
    "updatedAt": "2025-01-01T00:00:00.000Z"
  },
  "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "refreshToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "message": "Login successful"
}
```

#### 3. Refresh Token
```http
POST /api/auth/refresh
Content-Type: application/json

{
  "refreshToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
}
```

**Response:**
```json
{
  "success": true,
  "user": { /* user object */ },
  "accessToken": "new_access_token",
  "refreshToken": "new_refresh_token",
  "message": "Token refreshed successfully"
}
```

#### 4. Google Login (User)
```http
POST /api/user-auth/google
Content-Type: application/json

{
  "idToken": "<google_id_token>"
}
```

**Response:**
```json
{
  "success": true,
  "user": { /* user object */ },
  "accessToken": "...",
  "refreshToken": "...",
  "message": "Google login successful"
}
```

#### 5. Get User Profile
```http
GET /api/auth/profile
Authorization: Bearer <access_token>
```

**Response:**
```json
{
  "success": true,
  "user": {
    "id": "user_id",
    "email": "user@example.com",
    "name": "John Doe",
    "role": "STUDENT",
    "isPremium": false,
    "photoUrl": null,
    "createdAt": "2025-01-01T00:00:00.000Z",
    "updatedAt": "2025-01-01T00:00:00.000Z",
    "subscriptionPlan": "FREE",
    "subscriptionStatus": "ACTIVE",
    "trialEndsAt": null,
    "subscriptionEndsAt": null
  },
  "message": "Profile retrieved successfully"
}
```

#### 6. Update Profile
```http
PUT /api/auth/profile
Authorization: Bearer <access_token>
Content-Type: application/json

{
  "name": "Updated Name",
  "photoUrl": "https://example.com/photo.jpg"
}
```

#### 7. Change Password
```http
POST /api/auth/change-password
Authorization: Bearer <access_token>
Content-Type: application/json

{
  "currentPassword": "OldPass123!",
  "newPassword": "NewPass123!"
}
```

#### 8. Create Admin User (One-time setup)

### Anonymous Session Check
```http
GET /api/user-auth/session
```

Response when anonymous:
```json
{ "success": true, "isAnonymous": true }
```

Response when authenticated:
```json
{ "success": true, "isAnonymous": false, "user": { /* user */ } }
```

### Subscription (Paid Users)

#### 1. Start Checkout
```http
POST /api/user-auth/subscribe/start
Authorization: Bearer <access_token>
Content-Type: application/json

{
  "plan": "MONTHLY", // or YEARLY
  "successUrl": "https://app.example.com/billing/success",
  "cancelUrl": "https://app.example.com/billing/cancel"
}
```

Response:
```json
{ "success": true, "checkoutUrl": "https://checkout.stripe.com/...", "sessionId": "cs_test_..." }
```

#### 2. Stripe Webhook (server-to-server)
```
POST /api/user-auth/stripe/webhook
```

Configure `STRIPE_WEBHOOK_SECRET` and point your Stripe webhook to this URL.

#### 3. Get Subscription Status
```http
GET /api/user-auth/subscription
Authorization: Bearer <access_token>
```
Response:
```json
{
  "success": true,
  "subscription": {
    "subscriptionPlan": "FREE|MONTHLY|YEARLY",
    "subscriptionStatus": "ACTIVE|INACTIVE|CANCELED|PAST_DUE|TRIALING",
    "trialEndsAt": null,
    "subscriptionEndsAt": null,
    "isPremium": false
  }
}
```
```http
POST /api/admin/create-admin
Content-Type: application/json

{
  "email": "admin@dappdojo.com",
  "password": "AdminPass123!",
  "name": "Admin User"
}
```

## 🔒 Protected Routes

### Admin-Only Routes
These routes require authentication AND admin role:
- `POST /api/courses` - Create course
- `PUT /api/courses/:courseId` - Update course
- `DELETE /api/courses/:courseId` - Delete course
- `POST /api/courses/:courseId/modules` - Create module
- `PUT /api/modules/:moduleId` - Update module
- `DELETE /api/modules/:moduleId` - Delete module
- `POST /api/modules/:moduleId/lessons` - Create lesson
- `PUT /api/lessons/:lessonId` - Update lesson
- `DELETE /api/lessons/:lessonId` - Delete lesson
- `POST /api/lessons/:lessonId/challenge-tests` - Create challenge test
- `POST /api/lessons/:lessonId/quiz-questions` - Create quiz question

### Public Routes
These routes don't require authentication:
- `GET /api/courses` - List courses
- `GET /api/courses/:courseId` - Get course details
- `GET /api/courses/:courseId/modules` - List modules
- `GET /api/modules/:moduleId` - Get module details
- `GET /api/modules/:moduleId/lessons` - List lessons
- `GET /api/lessons/:lessonId` - Get lesson details
- `POST /api/compile` - Compile code
- `POST /api/test` - Run tests

## 🚨 Error Codes

### Authentication Errors
- `NO_TOKEN` - No access token provided
- `INVALID_TOKEN` - Invalid or malformed token
- `TOKEN_EXPIRED` - Token has expired
- `USER_NOT_FOUND` - User not found in database
- `AUTH_REQUIRED` - Authentication required for this route
- `ADMIN_REQUIRED` - Admin role required for this route
- `STUDENT_REQUIRED` - Student role required for this route

### Registration/Login Errors
- `MISSING_FIELDS` - Required fields missing
- `MISSING_CREDENTIALS` - Email or password missing
- `USER_EXISTS` - User with email already exists
- `INVALID_CREDENTIALS` - Invalid email or password
- `WEAK_PASSWORD` - Password doesn't meet requirements
- `SOCIAL_LOGIN_REQUIRED` - User must use social login

### Password Requirements
- Minimum 8 characters
- At least one uppercase letter
- At least one lowercase letter
- At least one number
- At least one special character

## 💻 Frontend Implementation Examples

### React/JavaScript Example

```javascript
class AuthService {
  constructor() {
    this.baseURL = 'http://localhost:3002';
    this.accessToken = localStorage.getItem('accessToken');
    this.refreshToken = localStorage.getItem('refreshToken');
  }

  // Set tokens in localStorage
  setTokens(accessToken, refreshToken) {
    this.accessToken = accessToken;
    this.refreshToken = refreshToken;
    localStorage.setItem('accessToken', accessToken);
    localStorage.setItem('refreshToken', refreshToken);
  }

  // Clear tokens
  clearTokens() {
    this.accessToken = null;
    this.refreshToken = null;
    localStorage.removeItem('accessToken');
    localStorage.removeItem('refreshToken');
  }

  // Get authorization header
  getAuthHeader() {
    return this.accessToken ? `Bearer ${this.accessToken}` : null;
  }

  // Make authenticated request
  async makeRequest(url, options = {}) {
    const headers = {
      'Content-Type': 'application/json',
      ...options.headers
    };

    if (this.accessToken) {
      headers.Authorization = `Bearer ${this.accessToken}`;
    }

    const response = await fetch(`${this.baseURL}${url}`, {
      ...options,
      headers
    });

    // If token expired, try to refresh
    if (response.status === 401 && this.refreshToken) {
      const refreshed = await this.refreshAccessToken();
      if (refreshed) {
        // Retry request with new token
        headers.Authorization = `Bearer ${this.accessToken}`;
        return fetch(`${this.baseURL}${url}`, {
          ...options,
          headers
        });
      }
    }

    return response;
  }

  // Register user
  async register(userData) {
    const response = await fetch(`${this.baseURL}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(userData)
    });

    const data = await response.json();
    
    if (data.success) {
      this.setTokens(data.accessToken, data.refreshToken);
    }

    return data;
  }

  // Login user
  async login(credentials) {
    const response = await fetch(`${this.baseURL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(credentials)
    });

    const data = await response.json();
    
    if (data.success) {
      this.setTokens(data.accessToken, data.refreshToken);
    }

    return data;
  }

  // Refresh access token
  async refreshAccessToken() {
    if (!this.refreshToken) return false;

    try {
      const response = await fetch(`${this.baseURL}/api/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken: this.refreshToken })
      });

      const data = await response.json();
      
      if (data.success) {
        this.setTokens(data.accessToken, data.refreshToken);
        return true;
      } else {
        this.clearTokens();
        return false;
      }
    } catch (error) {
      this.clearTokens();
      return false;
    }
  }

  // Get user profile
  async getProfile() {
    const response = await this.makeRequest('/api/auth/profile');
    return response.json();
  }

  // Update profile
  async updateProfile(updateData) {
    const response = await this.makeRequest('/api/auth/profile', {
      method: 'PUT',
      body: JSON.stringify(updateData)
    });
    return response.json();
  }

  // Change password
  async changePassword(passwordData) {
    const response = await this.makeRequest('/api/auth/change-password', {
      method: 'POST',
      body: JSON.stringify(passwordData)
    });
    return response.json();
  }

  // Logout
  logout() {
    this.clearTokens();
  }

  // Check if user is authenticated
  isAuthenticated() {
    return !!this.accessToken;
  }

  // Check if user is admin
  async isAdmin() {
    try {
      const profile = await this.getProfile();
      return profile.success && profile.user.role === 'ADMIN';
    } catch {
      return false;
    }
  }
}

// Usage example
const authService = new AuthService();

// Register
const registerResult = await authService.register({
  email: 'user@example.com',
  password: 'SecurePass123!',
  name: 'John Doe'
});

// Login
const loginResult = await authService.login({
  email: 'user@example.com',
  password: 'SecurePass123!'
});

// Make authenticated API call
const courses = await authService.makeRequest('/api/courses');
const coursesData = await courses.json();
```

### React Hook Example

```javascript
import { useState, useEffect, createContext, useContext } from 'react';

const AuthContext = createContext();

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const authService = new AuthService();

  useEffect(() => {
    // Check if user is already logged in
    if (authService.isAuthenticated()) {
      authService.getProfile()
        .then(data => {
          if (data.success) {
            setUser(data.user);
          } else {
            authService.logout();
          }
        })
        .finally(() => setLoading(false));
    } else {
      setLoading(false);
    }
  }, []);

  const login = async (credentials) => {
    const result = await authService.login(credentials);
    if (result.success) {
      setUser(result.user);
    }
    return result;
  };

  const register = async (userData) => {
    const result = await authService.register(userData);
    if (result.success) {
      setUser(result.user);
    }
    return result;
  };

  const logout = () => {
    authService.logout();
    setUser(null);
  };

  const value = {
    user,
    loading,
    login,
    register,
    logout,
    isAuthenticated: !!user,
    isAdmin: user?.role === 'ADMIN'
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
```

## 🛡️ Security Best Practices

1. **Store tokens securely**: Use httpOnly cookies or secure storage
2. **Implement token refresh**: Automatically refresh tokens before they expire
3. **Handle token expiration**: Redirect to login when refresh fails
4. **Validate user roles**: Check user roles before showing admin features
5. **Sanitize inputs**: Validate and sanitize all user inputs
6. **Use HTTPS**: Always use HTTPS in production
7. **Implement rate limiting**: Prevent brute force attacks

## 🔧 Environment Variables

Add these to your frontend environment:

```env
REACT_APP_API_BASE_URL=http://localhost:3002
REACT_APP_JWT_SECRET=your-jwt-secret-key
```

Backend variables for OAuth/Stripe:
```env
GOOGLE_CLIENT_ID=your-google-client-id
STRIPE_SECRET_KEY=sk_live_or_test
STRIPE_PRICE_MONTHLY=price_xxx
STRIPE_PRICE_YEARLY=price_xxx
STRIPE_WEBHOOK_SECRET=whsec_xxx
FRONTEND_URL=http://localhost:3000
```

## 📝 Next Steps

1. **Create admin user**: Run the seed script to create initial admin
2. **Implement authentication UI**: Login, register, profile forms
3. **Add route protection**: Protect admin routes in your frontend
4. **Handle token refresh**: Implement automatic token refresh
5. **Add error handling**: Handle authentication errors gracefully
6. **Test thoroughly**: Test all authentication flows

## 🚀 Quick Start

1. **Start the backend**:
   ```bash
   export FOUNDRY_CACHE_DIR="$(pwd)/foundry-projects" && export DATABASE_URL="postgresql://$(whoami)@localhost:5432/dappdojo_dev" && npm start
   ```

2. **Create admin user**:
   ```bash
   node scripts/create-admin.js
   ```

3. **Test authentication**:
   ```bash
   # Register a user
   curl -X POST http://localhost:3002/api/auth/register \
     -H "Content-Type: application/json" \
     -d '{"email":"test@example.com","password":"Test123!","name":"Test User"}'

   # Login
   curl -X POST http://localhost:3002/api/auth/login \
     -H "Content-Type: application/json" \
     -d '{"email":"test@example.com","password":"Test123!"}'
   ```

The authentication system is now ready for frontend integration! 🎉
