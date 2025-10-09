# Romero Tech Solutions - MSP Client Portal

A comprehensive Managed Service Provider (MSP) platform for managing client relationships, service requests, invoicing, and technical support operations.

## 🌟 Features

### Client Portal
- **Multi-language Support** - English and Spanish translations
- **Service Request Management** - Submit, track, and manage IT support tickets
- **Real-time Updates** - WebSocket-powered live notifications
- **File Management** - Secure file upload/download with virus scanning
- **Scheduler** - Book appointments with available technicians
- **Invoice Portal** - View and pay invoices via Stripe integration
- **Push Notifications** - Web push for service updates
- **Trusted Device Management** - Enhanced security with device recognition
- **Multi-Factor Authentication** - Optional 2FA for enhanced security

### Admin Dashboard
- **Role-Based Access Control (RBAC)** - Granular permission system
- **Business Management** - Manage client businesses and locations
- **Service Request Workflow** - Custom statuses, priorities, and automated workflows
- **Employee Management** - Technician scheduling and capacity management
- **Invoicing System** - Generate, track, and manage client invoices
- **Time Tracking** - Automatic work duration calculation
- **Reporting** - Comprehensive analytics and audit logs
- **File Browser** - Admin access to client files with audit trail
- **Permission Audit Log** - Track all permission checks and access attempts
- **Dark/Light Mode** - Theme support for both admin and client portals

## 🏗️ Architecture

### Frontend
- **Framework**: React 18 + TypeScript
- **Build Tool**: Vite 7
- **Styling**: Tailwind CSS
- **Icons**: Lucide React
- **State Management**: React Context API
- **Routing**: React Router v7
- **Real-time**: Socket.IO Client
- **Payments**: Stripe.js
- **Service Worker**: PWA support with offline capabilities

### Backend
- **Runtime**: Node.js (ES Modules)
- **Framework**: Express.js
- **Database**: PostgreSQL 16+
- **Real-time**: Socket.IO
- **Authentication**: JWT + AWS Cognito
- **Security**: Helmet, CORS, CSRF protection, rate limiting
- **File Storage**: Local filesystem with virus scanning (ClamAV)
- **Email**: AWS SES
- **SMS**: Twilio
- **Push Notifications**: Web Push (VAPID)
- **Payments**: Stripe

### Infrastructure (AWS)
- **Frontend**: AWS Amplify (CDN + Auto-deployment)
- **Backend**: EC2 (with systemd service + auto-deployment)
- **Database**: RDS PostgreSQL
- **Secrets**: AWS Secrets Manager
- **Email**: SES (Simple Email Service)
- **Authentication**: Cognito User Pools
- **Domain**: Route 53 + SSL (Let's Encrypt)
- **Storage**: EBS (Elastic Block Storage)

## 📋 Prerequisites

- **Node.js**: 18+ (LTS recommended)
- **PostgreSQL**: 12+ (16+ recommended)
- **AWS Account**: For Cognito, SES, and optional Amplify/RDS
- **Stripe Account**: For payment processing
- **Twilio Account**: For SMS notifications (optional)
- **ClamAV**: For virus scanning (optional but recommended)

## 🚀 Quick Start

### Option 1: Interactive Setup (Recommended)

The easiest way to get started is using the interactive setup script:

```bash
git clone https://github.com/lromero74/romero-tech-solutions.git
cd romero-tech-solutions
./setup.sh
```

The script will guide you through:
- Environment selection (development/production)
- Database configuration
- AWS service setup (Cognito, SES, Secrets Manager)
- Domain configuration
- Payment integration (Stripe)
- SMS integration (Twilio - optional)
- Push notifications (VAPID - optional)
- Dependency installation
- Database initialization
- Initial admin user creation

After completion, you'll have fully configured `.env` files and be ready to start development or deployment.

### Option 2: Manual Setup

If you prefer manual configuration or need more control:

### 1. Clone the Repository

```bash
git clone https://github.com/lromero74/romero-tech-solutions.git
cd romero-tech-solutions
```

### 2. Database Setup

Create a PostgreSQL database and run the setup script:

```bash
createdb your_database_name
psql -d your_database_name -f database_setup.sql
```

The `database_setup.sql` file includes:
- Complete table schemas (77 tables)
- Foreign key relationships
- Indexes and views
- Reference data (statuses, roles, permissions, translations)

**Note:** If you need to regenerate the database setup script from your current database:
```bash
./scripts/generate-database-setup.sh
```
This will create an updated `database_setup.sql` with the latest schema and reference data.

### 3. Backend Configuration

Navigate to the backend directory and create environment file:

```bash
cd backend
cp .env.example .env
```

Edit `.env` with your credentials:

```env
# Server Configuration
PORT=3001
NODE_ENV=development

# Database Configuration
DB_HOST=localhost
DB_PORT=5432
DB_NAME=your_database_name
DB_USER=your_db_user
DB_PASSWORD=your_db_password

# OR use AWS Secrets Manager
USE_SECRETS_MANAGER=false
DB_SECRET_ARN=arn:aws:secretsmanager:region:account:secret:name

# JWT Configuration
JWT_SECRET=your_secure_random_string_here
JWT_EXPIRATION=24h

# AWS Cognito
AWS_REGION=us-east-1
AWS_USER_POOL_ID=your_user_pool_id
AWS_USER_POOL_CLIENT_ID=your_client_id
AWS_USER_POOL_CLIENT_SECRET=your_client_secret

# CORS Configuration
CORS_ORIGINS=http://localhost:5173,http://localhost:5174

# Stripe
STRIPE_SECRET_KEY=sk_test_your_stripe_key
STRIPE_WEBHOOK_SECRET=whsec_your_webhook_secret

# Email (AWS SES)
AWS_SES_REGION=us-east-1
EMAIL_FROM=noreply@yourdomain.com

# SMS (Twilio) - Optional
TWILIO_ACCOUNT_SID=your_account_sid
TWILIO_AUTH_TOKEN=your_auth_token
TWILIO_PHONE_NUMBER=+1234567890

# Web Push Notifications
VAPID_PUBLIC_KEY=your_vapid_public_key
VAPID_PRIVATE_KEY=your_vapid_private_key
VAPID_SUBJECT=mailto:admin@yourdomain.com

# File Upload Configuration
MAX_FILE_SIZE_MB=10
UPLOAD_DIR=./uploads
ENABLE_VIRUS_SCANNING=false

# Security
ADMIN_IP_WHITELIST=127.0.0.1,::1
ENABLE_RATE_LIMITING=true
```

Install dependencies and start backend:

```bash
npm install
npm start
```

### 4. Frontend Configuration

Return to root directory and create environment file:

```bash
cd ..
cp .env.example .env
```

Edit `.env` with your configuration:

```env
# API Configuration
VITE_API_BASE_URL=http://localhost:3001/api

# AWS Cognito
VITE_AWS_REGION=us-east-1
VITE_AWS_USER_POOL_ID=your_user_pool_id
VITE_AWS_USER_POOL_CLIENT_ID=your_client_id
VITE_AWS_USER_POOL_CLIENT_SECRET=your_client_secret
VITE_AWS_OAUTH_DOMAIN=yourdomain.com

# Stripe
VITE_STRIPE_PUBLISHABLE_KEY=pk_test_your_stripe_key

# Feature Flags
VITE_DEMO_MODE=false
```

Install dependencies and start frontend:

```bash
npm install
npm run dev
```

The application will be available at:
- **Frontend**: http://localhost:5173
- **Backend API**: http://localhost:3001/api
- **Admin Portal**: http://localhost:5173/employees
- **Client Portal**: http://localhost:5173/clogin

## 🔧 Development

### Project Structure

```
romero-tech-solutions/
├── backend/
│   ├── config/          # Database, security, templates
│   ├── middleware/      # Auth, permissions, security
│   ├── routes/          # API endpoints
│   │   ├── admin/       # Admin-only routes
│   │   ├── client/      # Client portal routes
│   │   └── employee/    # Employee-specific routes
│   ├── services/        # Business logic
│   ├── utils/           # Helper functions
│   ├── migrations/      # Database migrations
│   └── server.js        # Application entry point
├── src/
│   ├── components/      # React components
│   │   ├── admin/       # Admin dashboard
│   │   └── client/      # Client portal
│   ├── contexts/        # React context providers
│   ├── hooks/           # Custom React hooks
│   ├── pages/           # Route pages
│   ├── utils/           # Frontend utilities
│   └── App.tsx          # Main application
├── public/              # Static assets
├── scripts/             # Utility scripts
└── database_setup.sql   # Database schema
```

### Available Scripts

**Frontend:**
```bash
npm run dev              # Start development server
npm run build            # Production build
npm run preview          # Preview production build
npm run lint             # Run ESLint
npm run test             # Run Jest tests
npm run test:coverage    # Test coverage report
```

**Backend:**
```bash
npm start                # Start production server
npm run dev              # Start with nodemon (auto-reload)
npm run migrate          # Run database migrations
```

### Development Workflow

1. **Local Development** (Frontend + Backend both on localhost):
   ```bash
   # Terminal 1 - Backend
   cd backend
   npm run dev

   # Terminal 2 - Frontend
   npm run dev
   ```

2. **Local Frontend + Production Database**:
   ```bash
   # Create backend/.env.local with production DB credentials
   cd backend
   npm run dev

   # Frontend uses localhost backend
   npm run dev
   ```

3. **Running Tests**:
   ```bash
   # Frontend unit tests
   npm run test

   # Backend tests
   cd backend
   npm run test
   ```

## 🚢 Deployment

### Option 1: AWS Amplify (Frontend) + EC2 (Backend)

**Frontend Deployment (AWS Amplify):**

1. Create Amplify app connected to your GitHub repository
2. Configure build settings (uses `amplify.yml`)
3. Set environment variables in Amplify Console:
   ```
   VITE_API_BASE_URL=https://api.yourdomain.com/api
   VITE_AWS_REGION=us-east-1
   VITE_AWS_USER_POOL_ID=your_pool_id
   VITE_AWS_USER_POOL_CLIENT_ID=your_client_id
   VITE_AWS_USER_POOL_CLIENT_SECRET=your_secret
   VITE_AWS_OAUTH_DOMAIN=yourdomain.com
   VITE_STRIPE_PUBLISHABLE_KEY=pk_live_your_key
   VITE_DEMO_MODE=false
   ```
4. Deploy via Git push to main branch (auto-deploys)

**Backend Deployment (EC2):**

1. Launch EC2 instance (Red Hat/Amazon Linux recommended)
2. Install Node.js, PostgreSQL client, Nginx
3. Clone repository to EC2
4. Configure backend `.env` with production credentials
5. Set up systemd service:

   ```bash
   # /etc/systemd/system/romero-backend.service
   [Unit]
   Description=Romero Tech Solutions Backend API
   After=network.target

   [Service]
   Type=simple
   User=ec2-user
   WorkingDirectory=/home/ec2-user/romero-tech-solutions-repo/backend
   ExecStart=/usr/bin/node server.js
   Restart=always
   RestartSec=10
   Environment=NODE_ENV=production

   [Install]
   WantedBy=multi-user.target
   ```

6. Configure Nginx as reverse proxy:

   ```nginx
   # /etc/nginx/conf.d/api.conf
   server {
       listen 80;
       server_name api.yourdomain.com;

       location / {
           proxy_pass http://localhost:3001;
           proxy_http_version 1.1;
           proxy_set_header Upgrade $http_upgrade;
           proxy_set_header Connection 'upgrade';
           proxy_set_header Host $host;
           proxy_set_header X-Real-IP $remote_addr;
           proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
           proxy_set_header X-Forwarded-Proto $scheme;
           proxy_cache_bypass $http_upgrade;
       }
   }
   ```

7. Set up SSL with Let's Encrypt:

   ```bash
   sudo certbot --nginx -d api.yourdomain.com
   ```

8. Enable and start services:

   ```bash
   sudo systemctl enable romero-backend
   sudo systemctl start romero-backend
   sudo systemctl enable nginx
   sudo systemctl start nginx
   ```

**Continuous Deployment (Backend):**

The included auto-deployment script monitors Git changes every 2 minutes:

```bash
# Copy auto-deployment script to EC2
~/auto-deploy-backend.sh

# Set up systemd timer for auto-deployment
sudo systemctl enable romero-auto-deploy.timer
sudo systemctl start romero-auto-deploy.timer
```

### Option 2: Docker Deployment (Alternative)

Create `docker-compose.yml`:

```yaml
version: '3.8'

services:
  postgres:
    image: postgres:16
    environment:
      POSTGRES_DB: romerotechsolutions
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: ${DB_PASSWORD}
    volumes:
      - postgres_data:/var/lib/postgresql/data
      - ./database_setup.sql:/docker-entrypoint-initdb.d/init.sql
    ports:
      - "5432:5432"

  backend:
    build: ./backend
    ports:
      - "3001:3001"
    environment:
      NODE_ENV: production
      DB_HOST: postgres
      DB_PORT: 5432
      DB_NAME: romerotechsolutions
    depends_on:
      - postgres
    volumes:
      - ./backend/uploads:/app/uploads

  frontend:
    build: .
    ports:
      - "80:80"
    environment:
      VITE_API_BASE_URL: http://backend:3001/api
    depends_on:
      - backend

volumes:
  postgres_data:
```

Deploy with:
```bash
docker-compose up -d
```

## 🔐 Security Features

- **Authentication**: JWT + AWS Cognito with MFA support
- **Authorization**: Role-Based Access Control (RBAC) with granular permissions
- **CSRF Protection**: Token-based CSRF validation
- **Rate Limiting**: IP-based throttling for API endpoints
- **Input Validation**: Joi schemas + DOMPurify sanitization
- **SQL Injection Prevention**: Parameterized queries
- **File Security**: Virus scanning, type validation, size limits
- **Session Management**: Automatic cleanup, device tracking
- **Audit Logging**: Permission checks, file access, admin actions
- **IP Whitelisting**: Admin route protection
- **HTTPS Enforcement**: SSL/TLS for all connections
- **Content Security Policy**: XSS prevention headers

## 📊 Database Migrations

Run migrations for schema updates:

```bash
cd backend
node run-migration.js
```

Migration files are in `backend/migrations/` and run automatically on deployment.

## 🧪 Testing

```bash
# Frontend tests
npm run test
npm run test:coverage

# Backend tests
cd backend
npm run test
```

## 📝 Environment Variables Reference

### Critical Frontend Variables
- `VITE_API_BASE_URL`: Backend API endpoint
- `VITE_AWS_USER_POOL_ID`: Cognito User Pool ID
- `VITE_STRIPE_PUBLISHABLE_KEY`: Stripe public key

### Critical Backend Variables
- `DB_HOST`, `DB_NAME`, `DB_USER`, `DB_PASSWORD`: Database connection
- `JWT_SECRET`: Secret for signing JWT tokens
- `AWS_USER_POOL_ID`: Cognito authentication
- `STRIPE_SECRET_KEY`: Stripe payment processing
- `CORS_ORIGINS`: Allowed frontend origins

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## 📜 License

This project is proprietary software. All rights reserved.

## 🆘 Support

For issues or questions:
- Open a GitHub issue
- Contact: support@romerotechsolutions.com

## 🔄 Version Check & Auto-Reload

The application includes automatic version checking that prompts users to reload when new versions are deployed (checks every 5 minutes in production).

Version is tracked in:
- `package.json` - npm version
- `public/version.json` - deployed version metadata
- `src/hooks/useVersionCheck.ts` - version constant

## 📚 Additional Documentation

- **CLAUDE.md**: Project-specific instructions and architecture notes
- **LOGGING.md**: Logging configuration and best practices
- **CACHE-BUSTING.md**: Cache management strategies
- **AMPLIFY-CACHE-SETUP.md**: AWS Amplify cache configuration

## 🎯 Key Features in Detail

### Role-Based Permissions

The system uses a sophisticated RBAC model:
- Roles: Executive, Manager, Technician, etc.
- Permissions: Granular (e.g., `modify.users.enable`, `view.invoices.enable`)
- Permission Inheritance: Higher roles inherit lower role permissions
- Dynamic Checks: Permissions evaluated at runtime (no hardcoded role checks)

### Multi-language Support

- Database-driven translations (English/Spanish)
- Client language preference stored per user
- Real-time language switching
- Translation management API for easy updates

### Service Request Workflow

- Customizable statuses and transitions
- Automated actions (emails, SMS, status changes)
- Time-based triggers (acknowledgment reminders, auto-close)
- Real-time WebSocket updates for instant notifications

### Invoicing System

- Automatic invoice generation from service requests
- Tiered hourly rates (standard, premium, emergency)
- First-hour complimentary for new clients
- Stripe payment integration
- Invoice history and payment tracking

---

**Built with ❤️ for Managed Service Providers**
