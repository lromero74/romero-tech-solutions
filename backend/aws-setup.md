# AWS Secrets Manager Setup for Database Credentials

## 1. IAM Policy for Secrets Manager Access

Create an IAM policy with the following permissions and attach it to your EC2 instance role or user:

```json
{
    "Version": "2012-10-17",
    "Statement": [
        {
            "Effect": "Allow",
            "Action": [
                "secretsmanager:GetSecretValue",
                "secretsmanager:DescribeSecret"
            ],
            "Resource": "arn:aws:secretsmanager:*:*:secret:rds-db-credentials/*"
        }
    ]
}
```

## 2. Environment Configuration

### Production (using Secrets Manager):
```bash
USE_SECRETS_MANAGER=true
DB_SECRET_NAME=rds-db-credentials/cluster-XXXXX/postgres
AWS_REGION=us-east-1
DB_SSL=true
```

### Development (using environment variables):
```bash
USE_SECRETS_MANAGER=false
DB_HOST=your-rds-endpoint.amazonaws.com
DB_PORT=5432
DB_NAME=romerotechsolutions
DB_USER=postgres
DB_PASSWORD=your-password
DB_SSL=true
```

## 3. How to Find Your Secret Name

1. Go to AWS Secrets Manager console
2. Find your RDS-related secret
3. Copy the secret name or ARN
4. Use the name (without ARN prefix) in `DB_SECRET_NAME`

Example secret names:
- `rds-db-credentials/cluster-abc123/postgres`
- `prod/rds/postgresql/credentials`
- `romerotechsolutions-db-secret`

## 4. AWS Credentials

The application will use credentials in this order:
1. IAM role (if running on EC2) - **Recommended**
2. Environment variables (`AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`)
3. AWS credentials file (`~/.aws/credentials`)
4. Default AWS SDK credential chain

## 5. Benefits of Using Secrets Manager

- ✅ Automatic password rotation
- ✅ Centralized credential management
- ✅ Audit logging for access
- ✅ No hardcoded passwords in code
- ✅ Automatic fallback to environment variables
- ✅ Credential caching for performance

## 6. Testing the Setup

The application will log which method it's using:
- `🔐 Using AWS Secrets Manager for database credentials`
- `📝 Using environment variables for database credentials`

## 7. Troubleshooting

If Secrets Manager fails, the app automatically falls back to environment variables.

Common issues:
- **Access denied**: Check IAM permissions
- **Secret not found**: Verify `DB_SECRET_NAME` value
- **Region mismatch**: Ensure `AWS_REGION` matches your secret's region