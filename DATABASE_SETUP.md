# Database Setup Guide

This guide will help you set up and connect your client registration system to your existing AWS RDS PostgreSQL database.

## Prerequisites

- AWS RDS PostgreSQL database instance
- Database access credentials (host, username, password)
- AWS CLI configured (optional but recommended)
- Node.js and npm installed

## Step 1: Update Database Connection

### 1.1 Update Backend Environment Variables

Edit `backend/.env` with your RDS details:

```env
# Database Configuration (AWS RDS)
DB_HOST=your-rds-endpoint.cluster-xxxxx.us-east-1.rds.amazonaws.com
DB_PORT=5432
DB_NAME=romero_tech
DB_USER=postgres
DB_PASSWORD=your-secure-password
DB_SSL=true

# AWS Configuration
AWS_REGION=us-east-1
AWS_ACCESS_KEY_ID=your-access-key-id
AWS_SECRET_ACCESS_KEY=your-secret-access-key

# Email Configuration (SES)
SES_FROM_EMAIL=noreply@romerotechsolutions.com
SES_FROM_NAME="Romero Tech Solutions"
```

### 1.2 Get Your RDS Connection Details

From AWS Console:
1. Go to RDS → Databases
2. Click on your database instance
3. Copy the "Endpoint" (this is your DB_HOST)
4. Note the Port (usually 5432 for PostgreSQL)

## Step 2: Run Database Migrations

### 2.1 Connect to Your RDS Database

Using psql command line:
```bash
psql -h your-rds-endpoint.cluster-xxxxx.us-east-1.rds.amazonaws.com -U postgres -d romero_tech
```

Or use a GUI tool like pgAdmin, DBeaver, or DataGrip.

### 2.2 Execute Schema Scripts in Order

Run the SQL files in the `database/schema/` directory in this order:

```bash
# 1. Create businesses table
\i database/schema/01_businesses_table.sql

# 2. Create service addresses table
\i database/schema/02_service_addresses_table.sql

# 3. Update users table for client relationships
\i database/schema/03_update_users_table.sql

# 4. Create stored procedures
\i database/schema/04_client_registration_procedures.sql
```

## Step 3: Set Up AWS SES for Email

### 3.1 Verify Your Domain in SES

1. Go to AWS SES Console
2. Click "Identities" → "Create Identity"
3. Select "Domain" and enter `romerotechsolutions.com`
4. Follow DNS verification steps

### 3.2 Create SES SMTP Credentials (Alternative)

If you prefer SMTP over SES SDK:
1. Go to SES Console → SMTP Settings
2. Create SMTP credentials
3. Update backend to use nodemailer with SMTP

### 3.3 Request Production Access

SES starts in sandbox mode. To send emails to unverified addresses:
1. Go to SES Console → Account dashboard
2. Request production access
3. Fill out the form explaining your use case

## Step 4: Test Database Connection

### 4.1 Install Backend Dependencies

```bash
cd backend
npm install
```

### 4.2 Test Database Connection

```bash
# Start the backend server
npm run dev

# Test endpoints
curl http://localhost:3001/health/db
```

You should see:
```json
{
  "status": "ok",
  "database": "connected",
  "timestamp": "2024-01-01T12:00:00.000Z"
}
```

## Step 5: Test Full Registration Flow

### 5.1 Start Both Frontend and Backend

Terminal 1 (Frontend):
```bash
npm run dev  # Should run on http://localhost:5173
```

Terminal 2 (Backend):
```bash
cd backend
npm run dev  # Should run on http://localhost:3001
```

### 5.2 Test Registration

1. Open http://localhost:5173
2. Click "Client Login"
3. Click "Create business account"
4. Fill out the registration form
5. Check your database for new records
6. Check email for confirmation message

## Step 6: Verify Database Records

After a successful registration, you should see:

```sql
-- Check businesses table
SELECT * FROM businesses ORDER BY created_at DESC LIMIT 5;

-- Check users table
SELECT * FROM users WHERE role = 'client' ORDER BY created_at DESC LIMIT 5;

-- Check service addresses
SELECT * FROM service_addresses ORDER BY created_at DESC LIMIT 5;

-- Check client view
SELECT * FROM v_client_users_with_business ORDER BY user_created_at DESC LIMIT 5;
```

## Troubleshooting

### Database Connection Issues

1. **Connection timeout**: Check security groups allow inbound on port 5432
2. **Authentication failed**: Verify username/password
3. **SSL errors**: Try setting `DB_SSL=false` for testing

### Email Issues

1. **SES sandbox**: Verify recipient email addresses in SES
2. **Production access**: Request production access for SES
3. **Rate limits**: Check SES sending quotas

### Common SQL Errors

1. **Function already exists**: Safe to ignore, functions use `CREATE OR REPLACE`
2. **Column already exists**: The scripts use `IF NOT EXISTS` checks
3. **Permission denied**: Ensure your database user has CREATE privileges

## Security Considerations

### Production Deployment

1. **Environment Variables**: Use AWS Systems Manager Parameter Store or Secrets Manager
2. **Database Security**: Enable encryption at rest and in transit
3. **Network Security**: Use VPC with proper security groups
4. **SSL Certificates**: Ensure all connections use SSL/TLS

### Example Production .env

```env
# Use AWS Systems Manager Parameter Store
DB_HOST=$(aws ssm get-parameter --name "/romero-tech/db/host" --query "Parameter.Value" --output text)
DB_PASSWORD=$(aws ssm get-parameter --name "/romero-tech/db/password" --with-decryption --query "Parameter.Value" --output text)
```

## API Endpoints

Once set up, these endpoints will be available:

```
POST /api/clients/register          # Register new client
POST /api/clients/confirm-email     # Confirm email address
POST /api/clients/resend-confirmation # Resend confirmation email
GET  /api/clients/check-email/:email # Check if email exists
POST /api/clients/validate-domain   # Validate business domain
GET  /health                        # Health check
GET  /health/db                     # Database health check
```

## Support

If you encounter issues:

1. Check the console logs in both frontend and backend
2. Verify database connection using `psql` directly
3. Test API endpoints using curl or Postman
4. Check AWS CloudWatch logs for SES issues

## Next Steps

After successful setup:

1. Configure AWS Lambda for serverless deployment
2. Set up AWS API Gateway for production API
3. Configure CloudFront for frontend distribution
4. Set up monitoring with CloudWatch
5. Configure backup strategy for RDS