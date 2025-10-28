# DappDojo Backend Service

A microservice for Solidity compilation and testing using Foundry. This service handles all blockchain-related operations for the DappDojo learning platform.

## Features

- **Solidity Compilation**: Compile Solidity contracts using Foundry
- **Test Execution**: Run comprehensive test suites
- **Dependency Management**: Automatic installation of forge-std, OpenZeppelin, and other dependencies
- **Workspace Management**: Isolated workspaces for each user/course
- **RESTful API**: Clean HTTP API for integration with frontend
- **Health Monitoring**: Built-in health checks and monitoring

## Architecture

This service runs independently from the main DappDojo application and communicates via HTTP API calls.

```
Frontend (Port 3000) → Backend Service (Port 3002) → Foundry → Response
```

## API Endpoints

### Health Check
- `GET /health` - Service health status

### Compilation
- `POST /api/compile` - Compile Solidity contracts
- `POST /api/test` - Run contract tests

### Course Management
- `GET /api/courses` - List courses
- `POST /api/courses` - Create new course
- `GET /api/courses/:id` - Get course details

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `PORT` | Server port | `3002` |
| `NODE_ENV` | Environment | `production` |
| `HOST` | Server host | `0.0.0.0` |
| `DATABASE_URL` | PostgreSQL connection string | Required |
| `CORS_ORIGIN` | Allowed CORS origin | `http://localhost:3000` |
| `STUDENT_WORKSPACES_DIR` | Workspace directory | `/tmp/student-workspaces` |

## Local Development

### Prerequisites
- Node.js 18+
- Foundry (installed automatically in Docker)
- PostgreSQL database

### Installation

```bash
# Install dependencies
npm install

# Copy environment variables
cp .env.example .env

# Start development server
npm run dev
```

### Testing

```bash
# Test compilation
curl -X POST http://localhost:3002/api/compile \
  -H "Content-Type: application/json" \
  -d '{
    "userId": "test-user",
    "courseId": "test-course",
    "lessonId": "test-lesson",
    "code": "pragma solidity ^0.8.30; contract Test { uint256 public value; }",
    "contractName": "Test"
  }'

# Health check
curl http://localhost:3002/health
```

## Deployment to Fly.io

### Prerequisites
- Fly.io CLI installed (`flyctl`)
- Fly.io account

### Initial Setup

```bash
# Login to Fly.io
flyctl auth login

# Create app (first time only)
flyctl apps create dappdojo-backend

# Deploy
flyctl deploy
```

### Environment Variables

Set production environment variables:

```bash
flyctl secrets set DATABASE_URL="postgresql://user:pass@host:port/db"
flyctl secrets set CORS_ORIGIN="https://your-frontend-domain.com"
flyctl secrets set NODE_ENV="production"
```

### Monitoring

```bash
# View logs
flyctl logs

# Check status
flyctl status

# SSH into machine
flyctl ssh console
```

## Docker

### Build Image
```bash
docker build -t dappdojo-backend .
```

### Run Container
```bash
docker run -p 3002:3002 \
  -e DATABASE_URL="postgresql://user:pass@host:port/db" \
  -e CORS_ORIGIN="http://localhost:3000" \
  dappdojo-backend
```

## Dependencies

### System Dependencies
- Git (for dependency installation)
- Curl (for health checks)
- Bash (for scripts)

### Node.js Dependencies
- `express` - Web framework
- `cors` - CORS middleware
- `helmet` - Security headers
- `compression` - Response compression
- `dotenv` - Environment variables

### Foundry Dependencies (included in lib/)
- `forge-std` - Foundry standard library
- `openzeppelin-contracts` - OpenZeppelin contracts
- `ds-test` - DappSys test utilities

## Performance

- **Memory**: 512MB allocated
- **CPU**: 1 shared CPU
- **Storage**: Persistent volume for workspaces
- **Auto-scaling**: Enabled with min 1 machine

## Security

- CORS protection
- Rate limiting
- Security headers (Helmet)
- Input validation
- Workspace isolation

## Monitoring

- Health check endpoint (`/health`)
- Structured logging
- Error tracking
- Performance metrics

## Troubleshooting

### Common Issues

1. **Foundry not found**: Ensure Foundry is installed in Docker image
2. **Permission errors**: Check workspace directory permissions
3. **Memory issues**: Increase VM memory allocation
4. **Database connection**: Verify DATABASE_URL is correct

### Debug Mode

```bash
# Enable debug logging
flyctl secrets set LOG_LEVEL="debug"

# View detailed logs
flyctl logs --follow
```

## Contributing

1. Fork the repository
2. Create feature branch
3. Make changes
4. Test locally
5. Submit pull request

## License

MIT License - see LICENSE file for details