# Backend API Setup Guide

## Option 1: Node.js/Express Backend

### 1. Create Backend Directory Structure
```
backend/
├── src/
│   ├── controllers/
│   │   ├── authController.js
│   │   ├── userController.js
│   │   ├── serviceController.js
│   │   └── clientController.js
│   ├── models/
│   │   ├── User.js
│   │   ├── Service.js
│   │   └── Client.js
│   ├── routes/
│   │   ├── auth.js
│   │   ├── users.js
│   │   ├── services.js
│   │   └── clients.js
│   ├── middleware/
│   │   ├── auth.js
│   │   └── roleCheck.js
│   ├── config/
│   │   └── database.js
│   └── app.js
├── package.json
└── serverless.yml (for AWS Lambda deployment)
```

### 2. Install Dependencies
```bash
cd backend
npm init -y
npm install express pg sequelize jsonwebtoken bcryptjs cors helmet
npm install -D nodemon
```

### 3. Database Schema (PostgreSQL)
```sql
-- Users table
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    cognito_id VARCHAR(255) UNIQUE NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    role VARCHAR(50) NOT NULL CHECK (role IN ('admin', 'technician', 'client')),
    name VARCHAR(255) NOT NULL,
    photo VARCHAR(500),
    pronouns VARCHAR(50),
    address TEXT,
    phone VARCHAR(50),
    notes TEXT,
    is_active BOOLEAN DEFAULT true,
    is_on_vacation BOOLEAN DEFAULT false,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Services table
CREATE TABLE services (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    description TEXT,
    category VARCHAR(100),
    estimated_hours DECIMAL(5,2),
    base_price DECIMAL(10,2),
    is_active BOOLEAN DEFAULT true,
    required_skills TEXT[],
    tools TEXT[],
    notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Clients table
CREATE TABLE clients (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id),
    company_name VARCHAR(255),
    logo VARCHAR(500),
    service_addresses JSONB,
    billing_address JSONB,
    contracts UUID[],
    preferred_technicians UUID[],
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Service requests table
CREATE TABLE service_requests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    client_id UUID REFERENCES clients(id),
    technician_id UUID REFERENCES users(id),
    contract_id UUID,
    services JSONB,
    priority VARCHAR(20) CHECK (priority IN ('low', 'medium', 'high', 'emergency')),
    status VARCHAR(20) CHECK (status IN ('pending', 'assigned', 'scheduled', 'in_progress', 'completed', 'cancelled', 'on_hold')),
    requested_date TIMESTAMP,
    scheduled_date TIMESTAMP,
    completed_date TIMESTAMP,
    estimated_hours DECIMAL(5,2),
    actual_hours DECIMAL(5,2),
    estimated_cost DECIMAL(10,2),
    actual_cost DECIMAL(10,2),
    title VARCHAR(255),
    description TEXT,
    client_notes TEXT,
    technician_notes TEXT,
    admin_notes TEXT,
    service_address JSONB,
    urgency VARCHAR(20) CHECK (urgency IN ('routine', 'urgent', 'emergency')),
    contact_person VARCHAR(255),
    contact_phone VARCHAR(50),
    preferred_time_slots JSONB,
    attachments JSONB,
    status_history JSONB,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

## Option 2: AWS Lambda + API Gateway

### 1. Serverless Framework Setup
```bash
npm install -g serverless
serverless create --template aws-nodejs --path romero-tech-api
cd romero-tech-api
npm install aws-sdk pg jsonwebtoken
```

### 2. Deploy to AWS
```bash
serverless deploy
```

## Required Environment Variables

Add these to your AWS Lambda environment or local backend:

```env
# Database
DB_HOST=your-rds-endpoint.amazonaws.com
DB_PORT=5432
DB_NAME=romero_tech
DB_USER=admin
DB_PASSWORD=your-password

# JWT
JWT_SECRET=your-jwt-secret

# AWS
AWS_REGION=us-east-1
AWS_USER_POOL_ID=your-user-pool-id
```

## API Endpoints Structure

```
GET    /api/users              - Get all users (admin only)
POST   /api/users              - Create user (admin only)
PUT    /api/users/:id          - Update user (admin only)
DELETE /api/users/:id          - Delete user (admin only)

GET    /api/services           - Get all services
POST   /api/services           - Create service (admin only)
PUT    /api/services/:id       - Update service (admin only)
DELETE /api/services/:id       - Delete service (admin only)

GET    /api/clients            - Get clients (admin/technician)
POST   /api/clients            - Create client (admin only)
PUT    /api/clients/:id        - Update client (admin/own data)

GET    /api/service-requests   - Get service requests (role-filtered)
POST   /api/service-requests   - Create service request
PUT    /api/service-requests/:id - Update service request
```