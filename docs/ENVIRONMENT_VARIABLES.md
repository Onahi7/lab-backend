# Environment Variables Documentation

This document provides comprehensive documentation for all environment variables used in the Laboratory Information System (LIS) backend application.

## Table of Contents

- [Overview](#overview)
- [Configuration Files](#configuration-files)
- [Required Variables](#required-variables)
- [Optional Variables](#optional-variables)
- [Environment-Specific Configuration](#environment-specific-configuration)
- [Security Best Practices](#security-best-practices)
- [Validation](#validation)
- [Examples](#examples)

## Overview

The LIS backend uses environment variables for configuration management. This approach provides:

- **Flexibility**: Different configurations for different environments (development, staging, production)
- **Security**: Sensitive credentials are not hardcoded in the source code
- **Portability**: Easy deployment across different environments
- **Validation**: Automatic validation of required variables on application startup

The application uses the `@nestjs/config` package with custom validation using `class-validator` to ensure all required environment variables are present and valid before the application starts.

## Configuration Files

The backend supports multiple environment-specific configuration files:

| File | Purpose | Priority |
|------|---------|----------|
| `.env` | Base configuration, fallback values | Lowest |
| `.env.development` | Local development configuration | Medium |
| `.env.staging` | Staging environment configuration | Medium |
| `.env.production` | Production environment configuration | Medium |
| `.env.example` | Template file with all available variables | N/A (not loaded) |

**Loading Priority**: The application loads `.env.{NODE_ENV}` first, then falls back to `.env` for any missing variables.

**Example**: If `NODE_ENV=development`, the application loads `.env.development` first, then `.env`.

## Required Variables

These variables **MUST** be set for the application to start. The application will fail validation and exit if any of these are missing.

### MONGODB_URI

**Description**: MongoDB connection string

**Type**: String (URI format)

**Required**: Yes

**Examples**:
- Local: `mongodb://localhost:27017/lis`
- Atlas: `mongodb+srv://username:password@cluster.mongodb.net/lis?retryWrites=true&w=majority`

**Notes**:
- For production, always use authentication and SSL
- Use different databases for different environments (e.g., `lis_dev`, `lis_staging`, `lis_production`)

### JWT_SECRET

**Description**: Secret key for signing JWT access tokens

**Type**: String

**Required**: Yes

**Minimum Length**: 32 characters recommended

**Generation**:
```bash
# Generate a secure random secret
openssl rand -base64 64
```

**Security**:
- Must be kept secret and never committed to version control
- Should be different for each environment
- Should be rotated periodically

### JWT_REFRESH_SECRET

**Description**: Secret key for signing JWT refresh tokens

**Type**: String

**Required**: Yes

**Minimum Length**: 32 characters recommended

**Notes**:
- **MUST** be different from `JWT_SECRET`
- Used to generate refresh tokens for token renewal
- Should be even more secure than `JWT_SECRET` as refresh tokens have longer lifetimes

## Optional Variables

These variables have default values and are not required for the application to start.

### Application Settings

#### PORT

**Description**: Port number for the HTTP server

**Type**: Number

**Default**: `3000`

**Range**: 1-65535

**Example**: `PORT=3000`

#### NODE_ENV

**Description**: Node.js environment mode

**Type**: Enum

**Default**: `development`

**Valid Values**: `development`, `staging`, `production`, `test`

**Example**: `NODE_ENV=production`

**Impact**:
- Determines which `.env.{NODE_ENV}` file is loaded
- Affects error message verbosity
- Influences logging behavior

### JWT Configuration

#### JWT_EXPIRES_IN

**Description**: Access token expiration time

**Type**: String (time format)

**Default**: `1h`

**Format**: `{number}{unit}` where unit is `s` (seconds), `m` (minutes), `h` (hours), `d` (days)

**Examples**: `30m`, `1h`, `2h`, `7d`

**Recommendations**:
- Development: `1h` or longer for convenience
- Production: `15m` to `1h` for security

#### JWT_REFRESH_EXPIRES_IN

**Description**: Refresh token expiration time

**Type**: String (time format)

**Default**: `7d`

**Examples**: `7d`, `30d`, `90d`

**Recommendations**:
- Should be significantly longer than access token expiration
- Typical values: 7-30 days

### CORS Configuration

#### CORS_ORIGIN

**Description**: Allowed origin(s) for Cross-Origin Resource Sharing

**Type**: String (URL or comma-separated URLs)

**Default**: `http://localhost:5173`

**Examples**:
- Single origin: `http://localhost:5173`
- Multiple origins: `http://localhost:5173,https://app.example.com`
- All origins (NOT recommended for production): `*`

**Security**:
- In production, always specify exact origins
- Never use `*` in production

### Logging Configuration

#### LOG_LEVEL

**Description**: Logging verbosity level

**Type**: Enum

**Default**: `info`

**Valid Values**: `error`, `warn`, `info`, `debug`, `verbose`

**Recommendations**:
- Development: `debug` or `verbose`
- Staging: `info` or `debug`
- Production: `warn` or `error`

### Rate Limiting

#### RATE_LIMIT_TTL

**Description**: Time window in seconds for rate limiting

**Type**: Number

**Default**: `60`

**Example**: `RATE_LIMIT_TTL=60` (1 minute window)

#### RATE_LIMIT_MAX

**Description**: Maximum number of requests per time window

**Type**: Number

**Default**: `100`

**Recommendations**:
- Development: `100` or higher
- Production: `50-100` depending on expected traffic

### File Upload Configuration

#### MAX_FILE_SIZE

**Description**: Maximum file size in bytes

**Type**: Number

**Default**: `5242880` (5MB)

**Common Values**:
- 5MB: `5242880`
- 10MB: `10485760`
- 20MB: `20971520`

#### ALLOWED_MIME_TYPES

**Description**: Comma-separated list of allowed MIME types for file uploads

**Type**: String (comma-separated)

**Default**: `image/jpeg,image/png,image/gif,application/pdf`

**Examples**:
- Images only: `image/jpeg,image/png,image/gif`
- Documents: `application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document`

### Email Configuration (Optional)

#### EMAIL_HOST

**Description**: SMTP server hostname

**Type**: String

**Default**: None

**Examples**: `smtp.gmail.com`, `smtp.sendgrid.net`, `smtp.mailtrap.io`

#### EMAIL_PORT

**Description**: SMTP server port

**Type**: Number

**Default**: `587`

**Common Ports**:
- `587`: TLS (recommended)
- `465`: SSL
- `25`: Unencrypted (not recommended)

#### EMAIL_SECURE

**Description**: Use secure connection (SSL/TLS)

**Type**: Boolean (string)

**Default**: `false`

**Valid Values**: `true`, `false`

#### EMAIL_USER

**Description**: SMTP authentication username

**Type**: String

**Default**: None

#### EMAIL_PASSWORD

**Description**: SMTP authentication password

**Type**: String

**Default**: None

**Security**: Never commit this to version control

#### EMAIL_FROM

**Description**: Default "from" email address

**Type**: String (email format)

**Default**: `noreply@lis.com`

### SMS Configuration (Optional)

#### SMS_PROVIDER

**Description**: SMS service provider

**Type**: String

**Default**: `twilio`

**Valid Values**: `twilio`, `nexmo`, `aws-sns`

#### SMS_ACCOUNT_SID

**Description**: Twilio Account SID (if using Twilio)

**Type**: String

**Default**: None

#### SMS_AUTH_TOKEN

**Description**: Twilio Auth Token (if using Twilio)

**Type**: String

**Default**: None

**Security**: Never commit this to version control

#### SMS_FROM_NUMBER

**Description**: SMS sender phone number

**Type**: String (E.164 format)

**Default**: None

**Format**: `+1234567890` (country code + number)

## Environment-Specific Configuration

### Development Environment

**File**: `.env.development`

**Characteristics**:
- Local MongoDB instance
- Verbose logging (`LOG_LEVEL=debug`)
- Relaxed rate limiting
- Frontend on `http://localhost:5173`
- Test email/SMS services (e.g., Mailtrap)

**Example**:
```env
NODE_ENV=development
PORT=3000
MONGODB_URI=mongodb://localhost:27017/lis_dev
JWT_SECRET=dev-secret-key-change-in-production
JWT_REFRESH_SECRET=dev-refresh-secret-key-change-in-production
CORS_ORIGIN=http://localhost:5173
LOG_LEVEL=debug
```

### Staging Environment

**File**: `.env.staging`

**Characteristics**:
- MongoDB Atlas or staging database
- Moderate logging (`LOG_LEVEL=info`)
- Production-like configuration
- Staging frontend URL
- Test email/SMS services or production services

**Example**:
```env
NODE_ENV=staging
PORT=3000
MONGODB_URI=mongodb+srv://user:pass@cluster-staging.mongodb.net/lis_staging
JWT_SECRET=staging-secret-key-use-strong-random-string
JWT_REFRESH_SECRET=staging-refresh-secret-key-use-strong-random-string
CORS_ORIGIN=https://staging.lis.example.com
LOG_LEVEL=info
```

### Production Environment

**File**: `.env.production`

**Characteristics**:
- MongoDB Atlas production cluster with authentication and SSL
- Minimal logging (`LOG_LEVEL=warn` or `error`)
- Strict rate limiting
- Production frontend URL(s)
- Production email/SMS services
- Strong, cryptographically random secrets

**Example**:
```env
NODE_ENV=production
PORT=3000
MONGODB_URI=mongodb+srv://user:pass@cluster-prod.mongodb.net/lis_production?ssl=true
JWT_SECRET=REPLACE-WITH-STRONG-RANDOM-SECRET-64-CHARS
JWT_REFRESH_SECRET=REPLACE-WITH-DIFFERENT-STRONG-RANDOM-SECRET-64-CHARS
CORS_ORIGIN=https://lis.example.com
LOG_LEVEL=warn
RATE_LIMIT_MAX=50
```

## Security Best Practices

### 1. Never Commit Secrets

**DO**:
- Add `.env*` to `.gitignore` (except `.env.example`)
- Use environment variables or secrets management services
- Keep `.env.example` updated as a template

**DON'T**:
- Commit `.env`, `.env.development`, `.env.staging`, or `.env.production`
- Hardcode secrets in source code
- Share secrets via email or chat

### 2. Use Strong Secrets

**JWT Secrets**:
- Minimum 32 characters
- Use cryptographically random strings
- Generate using: `openssl rand -base64 64`

**Example**:
```bash
# Generate JWT_SECRET
openssl rand -base64 64

# Generate JWT_REFRESH_SECRET (different from JWT_SECRET)
openssl rand -base64 64
```

### 3. Rotate Secrets Regularly

- Rotate JWT secrets every 3-6 months
- Rotate database passwords every 6-12 months
- Rotate API keys when team members leave
- Have a secret rotation plan

### 4. Use Different Secrets Per Environment

- Development secrets can be simpler for convenience
- Staging secrets should be production-like
- Production secrets must be strong and unique
- Never reuse production secrets in other environments

### 5. Use Secrets Management Services

For production, consider using:
- **AWS Secrets Manager**: For AWS deployments
- **Azure Key Vault**: For Azure deployments
- **Google Secret Manager**: For GCP deployments
- **HashiCorp Vault**: For on-premise or multi-cloud
- **Doppler**: For centralized secrets management

### 6. Limit Access to Secrets

- Only authorized personnel should access production secrets
- Use role-based access control (RBAC)
- Audit secret access
- Use temporary credentials when possible

### 7. Environment Variable Validation

The application validates all environment variables on startup:
- Required variables must be present
- Variables must have correct types
- Variables must meet constraints (e.g., minimum length)

If validation fails, the application will not start and will display detailed error messages.

## Validation

The application uses `class-validator` to validate environment variables on startup. The validation schema is defined in `src/config/env.validation.ts`.

### Validation Rules

| Variable | Rules |
|----------|-------|
| `NODE_ENV` | Must be one of: `development`, `staging`, `production`, `test` |
| `PORT` | Must be a number, minimum value: 1 |
| `MONGODB_URI` | Must be a non-empty string |
| `JWT_SECRET` | Must be a non-empty string |
| `JWT_REFRESH_SECRET` | Must be a non-empty string |
| `RATE_LIMIT_TTL` | Must be a number, minimum value: 1 |
| `RATE_LIMIT_MAX` | Must be a number, minimum value: 1 |
| `MAX_FILE_SIZE` | Must be a number, minimum value: 1 |

### Validation Errors

If validation fails, the application will exit with an error message:

```
Environment validation failed:
MONGODB_URI: MONGODB_URI should not be empty
JWT_SECRET: JWT_SECRET should not be empty
JWT_REFRESH_SECRET: JWT_REFRESH_SECRET should not be empty
```

### Custom Validation

To add custom validation rules:

1. Edit `src/config/env.validation.ts`
2. Add the new variable to the `EnvironmentVariables` class
3. Add validation decorators from `class-validator`
4. Update `src/config/configuration.ts` to use the new variable

**Example**:
```typescript
// src/config/env.validation.ts
export class EnvironmentVariables {
  // ... existing variables

  @IsString()
  @MinLength(10)
  NEW_API_KEY!: string;
}

// src/config/configuration.ts
export default () => ({
  // ... existing config
  
  newService: {
    apiKey: process.env.NEW_API_KEY,
  },
});
```

## Examples

### Local Development Setup

1. Copy the example file:
```bash
cp .env.example .env.development
```

2. Edit `.env.development`:
```env
NODE_ENV=development
PORT=3000
MONGODB_URI=mongodb://localhost:27017/lis_dev
JWT_SECRET=dev-secret-key-change-in-production-12345678
JWT_REFRESH_SECRET=dev-refresh-secret-key-change-in-production-12345678
CORS_ORIGIN=http://localhost:5173
LOG_LEVEL=debug
```

3. Start the application:
```bash
pnpm run start:dev
```

### Production Deployment

1. Generate strong secrets:
```bash
# Generate JWT_SECRET
JWT_SECRET=$(openssl rand -base64 64)
echo "JWT_SECRET=$JWT_SECRET"

# Generate JWT_REFRESH_SECRET
JWT_REFRESH_SECRET=$(openssl rand -base64 64)
echo "JWT_REFRESH_SECRET=$JWT_REFRESH_SECRET"
```

2. Set environment variables (method depends on hosting platform):

**Docker**:
```bash
docker run -e NODE_ENV=production \
  -e MONGODB_URI="mongodb+srv://..." \
  -e JWT_SECRET="..." \
  -e JWT_REFRESH_SECRET="..." \
  your-image
```

**Kubernetes**:
```yaml
apiVersion: v1
kind: Secret
metadata:
  name: lis-backend-secrets
type: Opaque
stringData:
  MONGODB_URI: "mongodb+srv://..."
  JWT_SECRET: "..."
  JWT_REFRESH_SECRET: "..."
```

**AWS Elastic Beanstalk**:
```bash
eb setenv NODE_ENV=production \
  MONGODB_URI="mongodb+srv://..." \
  JWT_SECRET="..." \
  JWT_REFRESH_SECRET="..."
```

**Heroku**:
```bash
heroku config:set NODE_ENV=production
heroku config:set MONGODB_URI="mongodb+srv://..."
heroku config:set JWT_SECRET="..."
heroku config:set JWT_REFRESH_SECRET="..."
```

### Testing Configuration

Create `.env.test` for testing:
```env
NODE_ENV=test
PORT=3001
MONGODB_URI=mongodb://localhost:27017/lis_test
JWT_SECRET=test-secret-key
JWT_REFRESH_SECRET=test-refresh-secret-key
CORS_ORIGIN=http://localhost:5173
LOG_LEVEL=error
```

### Accessing Configuration in Code

The configuration is available globally via `ConfigService`:

```typescript
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class MyService {
  constructor(private configService: ConfigService) {}

  someMethod() {
    // Get a configuration value
    const port = this.configService.get<number>('app.port');
    const dbUri = this.configService.get<string>('database.uri');
    const jwtSecret = this.configService.get<string>('jwt.secret');

    // Get with default value
    const logLevel = this.configService.get<string>('logging.level', 'info');

    // Get entire configuration object
    const jwtConfig = this.configService.get('jwt');
    // jwtConfig = { secret: '...', expiresIn: '1h', ... }
  }
}
```

## Troubleshooting

### Application Won't Start

**Error**: `Environment validation failed`

**Solution**: Check that all required variables are set in your `.env` file:
- `MONGODB_URI`
- `JWT_SECRET`
- `JWT_REFRESH_SECRET`

### Database Connection Failed

**Error**: `MongooseError: Could not connect to any servers`

**Solution**: 
- Verify `MONGODB_URI` is correct
- Ensure MongoDB is running (for local development)
- Check network connectivity (for MongoDB Atlas)
- Verify credentials and IP whitelist (for MongoDB Atlas)

### CORS Errors

**Error**: `Access to XMLHttpRequest has been blocked by CORS policy`

**Solution**: 
- Verify `CORS_ORIGIN` matches your frontend URL exactly
- Include protocol (`http://` or `https://`)
- For multiple origins, use comma-separated list

### JWT Token Errors

**Error**: `JsonWebTokenError: invalid signature`

**Solution**:
- Ensure `JWT_SECRET` is the same across all backend instances
- Don't change `JWT_SECRET` while users have active sessions
- Clear browser storage if you changed the secret

## Additional Resources

- [NestJS Configuration Documentation](https://docs.nestjs.com/techniques/configuration)
- [class-validator Documentation](https://github.com/typestack/class-validator)
- [MongoDB Connection String Format](https://www.mongodb.com/docs/manual/reference/connection-string/)
- [JWT Best Practices](https://tools.ietf.org/html/rfc8725)

## Changelog

| Date | Version | Changes |
|------|---------|---------|
| 2024-01-XX | 1.0.0 | Initial documentation |

---

**Last Updated**: January 2024  
**Maintained By**: Backend Development Team