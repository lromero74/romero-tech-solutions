# AWS Production Setup Checklist

## ✅ **Completed (by this guide):**
- [x] Environment variables configured (.env file)
- [x] AWS configuration updated (aws-config.ts)
- [x] Authentication switched to EnhancedAuthContext
- [x] AWS Amplify dependencies installed
- [x] Components updated to use real auth
- [x] AWS configuration enabled

## 🔧 **Required AWS Setup:**

### 1. AWS Cognito User Pool
```bash
# Create User Pool with custom attributes
aws cognito-idp create-user-pool --pool-name "RomeroTechSolutions" --policies '{
  "PasswordPolicy": {
    "MinimumLength": 8,
    "RequireUppercase": true,
    "RequireLowercase": true,
    "RequireNumbers": true
  }
}'

# Note the UserPoolId from response
# Create User Pool Client
aws cognito-idp create-user-pool-client \
  --user-pool-id "your-user-pool-id" \
  --client-name "RomeroTechSolutions-Client"
```

### 2. AWS RDS PostgreSQL Database
```bash
# Create RDS instance
aws rds create-db-instance \
  --db-instance-identifier romero-tech-db \
  --db-instance-class db.t3.micro \
  --engine postgres \
  --master-username admin \
  --master-user-password "YourSecurePassword123!" \
  --allocated-storage 20
```

### 3. API Gateway + Lambda Backend
- Deploy backend API using serverless framework or AWS CDK
- Set up database tables (see BACKEND_SETUP.md)
- Configure CORS for frontend domain

## 🔑 **Update Environment Variables:**

Replace these values in `.env`:
```env
VITE_AWS_REGION=us-east-1
VITE_AWS_USER_POOL_ID=us-east-1_XXXXXXXXX  # From Cognito setup
VITE_AWS_USER_POOL_CLIENT_ID=XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX  # From Cognito setup
VITE_API_BASE_URL=https://your-api-id.execute-api.us-east-1.amazonaws.com/prod
VITE_DEMO_MODE=false
```

## 🚨 **Breaking Changes When Switching:**

1. **Authentication Flow Changes:**
   - Demo: Simple email/password with mock roles
   - Production: AWS Cognito with email verification

2. **Data Persistence:**
   - Demo: Lost on page refresh
   - Production: Persistent in RDS database

3. **API Calls:**
   - Demo: Local state updates
   - Production: HTTP requests to AWS API Gateway

4. **First Admin Registration:**
   - Demo: Any email works
   - Production: Requires valid email and verification

## 🧪 **Testing Production Setup:**

1. **Cognito Test:**
   ```bash
   # Test Cognito user creation
   aws cognito-idp admin-create-user \
     --user-pool-id your-user-pool-id \
     --username admin@yourcompany.com \
     --message-action SUPPRESS \
     --temporary-password TempPass123!
   ```

2. **Database Test:**
   ```bash
   # Test RDS connection
   psql -h your-rds-endpoint.amazonaws.com -U admin -d romero_tech
   ```

3. **API Test:**
   ```bash
   # Test API endpoint
   curl https://your-api-gateway-url.amazonaws.com/prod/health
   ```

## 💰 **AWS Costs (Estimated Monthly):**

- **Cognito:** $0 (first 50,000 MAUs free)
- **RDS t3.micro:** ~$15-20/month
- **API Gateway:** ~$3.50 per million requests
- **Lambda:** ~$0.20 per million requests
- **Data Transfer:** Varies by usage

**Total Estimated:** $20-30/month for small business use

## 🔒 **Security Considerations:**

1. **Environment Variables:**
   - Never commit .env to version control
   - Use AWS Secrets Manager for production secrets

2. **Database Security:**
   - Place RDS in private subnet
   - Use security groups to restrict access
   - Enable encryption at rest

3. **API Security:**
   - Enable JWT token validation
   - Implement rate limiting
   - Use HTTPS only

## 🚀 **Deployment Options:**

1. **Frontend (React):**
   - AWS S3 + CloudFront
   - Vercel
   - Netlify

2. **Backend (API):**
   - AWS Lambda + API Gateway (serverless)
   - AWS ECS (containerized)
   - AWS EC2 (traditional server)

## 📞 **Support:**

If you encounter issues during setup:
1. Check AWS CloudWatch logs
2. Verify environment variables
3. Test individual AWS services
4. Review network/security group settings