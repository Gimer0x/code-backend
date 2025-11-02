# Backend Project Structure

## Directory Structure

```
backend/
├── src/                          # Source code
│   ├── adminCompilationManager.js
│   ├── adminTestManager.js
│   ├── aiService.js
│   ├── authMiddleware.js
│   ├── authService.js
│   ├── courseManager.js
│   ├── courseProjectManager.js
│   ├── courseService.js
│   ├── imageUpload.js
│   ├── lessonService.js
│   ├── libraryManager.js
│   ├── moduleService.js
│   ├── studentWorkspaceService.js
│   ├── subscriptionService.js
│   └── templateManager.js
│
├── scripts/                       # Utility scripts
│   ├── check-course.js
│   ├── check-lesson-tests.js
│   ├── cleanup-courses-students.js
│   ├── create-admin.js
│   ├── migrate-db.js
│   ├── update-admin-password.js
│   └── verify-admin.js
│
├── prisma/                        # Database schema and migrations
│   ├── schema.prisma              # Database schema
│   ├── seed.ts                   # Database seeding
│   ├── migrations/               # Migration history
│   │   ├── 20250912163746_init/
│   │   ├── 20250912213937_add_subscription_fields/
│   │   ├── 20251018214604_add_challenge_system/
│   │   └── 20251024174025_add_language_support/
│   └── dev.db                    # Local SQLite database (dev)
│
├── foundry-projects/              # Course Foundry projects (created dynamically)
│   └── course-{courseId}/         # Per-course Foundry project
│       ├── foundry.toml          # Foundry configuration
│       ├── foundry.lock          # Dependency lock file
│       ├── remappings.txt         # Import remappings
│       ├── src/                   # Source contracts
│       ├── test/                  # Test files
│       ├── script/                # Scripts
│       ├── lib/                   # Dependencies (forge-std, OpenZeppelin, etc.)
│       ├── out/                   # Compiled artifacts
│       └── cache/                 # Foundry cache
│
├── courses/                       # Course data (legacy/local)
│   └── solidity-101/
│       ├── lib/
│       └── students/
│
├── uploads/                       # Uploaded files
│   └── courses/                  # Course thumbnails and images
│
├── migrations/                    # SQL migrations (additional)
│   └── add_subscription_starts_at.sql
│
├── index.js                       # Main Express.js server file
├── package.json                   # Dependencies and scripts
├── Dockerfile                     # Docker image configuration
├── fly.toml                       # Fly.io deployment config
│
├── deploy.sh                      # Deployment script
├── create-admin-user.sh          # Admin user creation script
├── create-db.sh                   # Database creation script
├── attach-database.sh            # Database attachment script
├── verify-db.sh                   # Database verification script
├── test-compile.sh                # Test compilation script
└── test-compile-command.sh        # Test compilation command
│
└── Documentation files (*.md)
    ├── README.md
    ├── CHECK_DATABASE.md
    ├── COURSE_PROJECT_FIX.md
    ├── CREATE_DATABASE.md
    ├── FLY_DATABASE_SETUP.md
    ├── FRONTEND_AUTH_INTEGRATION.md
    ├── STRIPE_WEBHOOK_LOCAL_SETUP.md
    ├── TROUBLESHOOTING_401.md
    ├── VERIFY_ADMIN.md
    └── ... (more documentation files)
```

## Key Directories

### `/src`
Core application logic:
- **adminCompilationManager.js**: Handles Solidity compilation for admin users
- **adminTestManager.js**: Handles Foundry test execution for admin users
- **authService.js**: Authentication and authorization logic
- **courseService.js**: Course management operations
- **studentWorkspaceService.js**: Student workspace management
- **subscriptionService.js**: Subscription management

### `/prisma`
Database layer:
- **schema.prisma**: Prisma ORM schema (defines all database models)
- **migrations/**: Database migration history
- **seed.ts**: Seed data for development

### `/foundry-projects`
Foundry project directories for each course:
- Auto-created when needed
- One directory per course: `course-{courseId}`
- Contains full Foundry project structure

### `/scripts`
Utility scripts for maintenance:
- Database migrations
- Admin user management
- Course verification
- Cleanup operations

## Environment-Specific Paths

### Local Development
- Foundry projects: `./foundry-projects/`
- Database: SQLite at `prisma/dev.db` or PostgreSQL via `DATABASE_URL`

### Production (Fly.io)
- Foundry projects: `/app/foundry-projects/` (persistent volume)
- Database: PostgreSQL via `DATABASE_URL` secret
- Student sessions: `/app/student-sessions/`

## Important Files

### `index.js`
Main Express.js server:
- API endpoints
- Middleware configuration
- Error handling
- Server startup

### `package.json`
Dependencies and scripts:
- `npm start`: Start server
- `npm run dev`: Development mode with watch
- `npm run create-admin`: Create admin user
- `npm run db:migrate:prod`: Run production migrations

### `Dockerfile`
Container configuration:
- Node.js base image
- Foundry installation
- Application setup

### `fly.toml`
Fly.io deployment config:
- Machine resources
- Volume mounts
- Environment variables

## Database Schema

See `prisma/schema.prisma` for full database structure. Key models:
- `User`: Users and authentication
- `Course`: Course definitions
- `CourseProject`: Foundry project configuration
- `Lesson`: Course lessons
- `StudentProgress`: Student progress tracking
- `SubscriptionPlan`: Subscription plans

## Volume Mounts (Fly.io)

- `/app/foundry-projects`: Persistent Foundry projects (mounted volume)
- `/app/student-sessions`: Student session data (ephemeral)

## File Naming Conventions

- **Services**: `*Service.js` (e.g., `courseService.js`)
- **Managers**: `*Manager.js` (e.g., `adminCompilationManager.js`)
- **Scripts**: lowercase with dashes (e.g., `create-admin.js`)
- **Config**: lowercase (e.g., `fly.toml`, `foundry.toml`)

