# Hobour Diagnostics - Laboratory Information System Backend

NestJS REST API backend for Hobour Diagnostics Laboratory Information System (LIS).

## Description

This is the backend API server for the Hobour Diagnostics LIS application, built with NestJS and MongoDB. It provides REST endpoints for managing patients, orders, samples, results, test catalog, machines, quality control, and analyzer integration.

## Technology Stack

- **Framework**: NestJS 11.x
- **Database**: MongoDB 7.x with Mongoose ODM
- **Authentication**: JWT (JSON Web Tokens)
- **Validation**: Class Validator
- **Testing**: Jest
- **Documentation**: Swagger/OpenAPI

## Prerequisites

- Node.js 18+ or 20+
- pnpm 8+
- MongoDB 7+ (local or MongoDB Atlas)

## Installation

```bash
# Install dependencies
pnpm install
```

## Configuration

1. Copy the example environment file:
```bash
cp .env.example .env
```

2. Update the `.env` file with your configuration:
   - `MONGODB_URI`: Your MongoDB connection string
   - `JWT_SECRET`: Secret key for JWT tokens (change in production!)
   - `CORS_ORIGIN`: Frontend URL for CORS configuration

## Running the Application

```bash
# Development mode with hot-reload
pnpm run start:dev

# Production mode
pnpm run build
pnpm run start:prod

# Debug mode
pnpm run start:debug
```

The API will be available at `http://localhost:3000`

## API Documentation

Once the application is running, access the Swagger documentation at:
```
http://localhost:3000/api/docs
```

## Testing

```bash
# Unit tests
pnpm run test

# E2E tests
pnpm run test:e2e

# Test coverage
pnpm run test:cov

# Watch mode
pnpm run test:watch
```

## Project Structure

```
backend/
├── src/
│   ├── modules/          # Feature modules
│   │   ├── auth/         # Authentication
│   │   ├── users/        # User management
│   │   ├── patients/     # Patient management
│   │   ├── orders/       # Order management
│   │   ├── samples/      # Sample tracking
│   │   ├── results/      # Result management
│   │   ├── test-catalog/ # Test catalog
│   │   ├── machines/     # Machine management
│   │   ├── hl7/          # HL7/ASTM/LIS2-A2 processing
│   │   ├── qc/           # Quality control
│   │   ├── audit/        # Audit logging
│   │   └── reports/      # Reporting
│   ├── common/           # Shared code
│   │   ├── guards/       # Auth & role guards
│   │   ├── interceptors/ # Logging, transform
│   │   ├── pipes/        # Validation
│   │   ├── decorators/   # Custom decorators
│   │   └── filters/      # Exception filters
│   ├── config/           # Configuration
│   ├── database/         # Database connection
│   └── main.ts           # Application entry
├── test/                 # E2E tests
└── package.json
```

## Code Quality

```bash
# Lint code
pnpm run lint

# Format code
pnpm run format
```

## Environment Variables

See `.env.example` for all available environment variables and their descriptions.

## License

UNLICENSED - Private project
