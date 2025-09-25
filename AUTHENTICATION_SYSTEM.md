# Role-Based Authentication System

## 🎯 Overview

I've implemented a comprehensive role-based authentication system with three user classes, AWS integration, and protected dashboards.

## 🔐 Authentication Classes

### 1. **Admin Users**
- **Access**: Hidden `/admin` path in URL bar
- **First Admin**: No email verification required for first admin user
- **Capabilities**:
  - Manage services list
  - Create and manage admins and technicians
  - Grant admin rights to technicians
  - Create and manage clients
  - Full system access

### 2. **Technician Users**
- **Created by**: Admin users
- **Data Fields**: Name, photo, pronouns, address, phone, email, notes, services checklist, availability
- **Capabilities**:
  - Access technician dashboard
  - View assigned work orders
  - Update work status
  - Can be promoted to admin

### 3. **Client Users**
- **Created by**: Admin users
- **Data Fields**: Name, address, service addresses, logo/photo, phone, email, notes
- **Capabilities**:
  - Access client dashboard
  - View service history
  - Request services
  - Manage profile

## 🗄️ Database Schema

### Core Tables (AWS RDS)
- **Users**: Core user data with role-based attributes
- **Services**: Manageable service catalog
- **Clients**: Client-specific information
- **Technicians**: Technician skills and availability
- **Contracts**: Service agreements
- **Work Orders**: Service requests and tracking

## 🚀 Key Features

### Admin Portal (`/admin`)
- **Hidden Access**: Only accessible via direct URL entry
- **First Admin Setup**: Automatically makes first user the default admin
- **User Management**: Create/edit/delete all user types
- **Service Management**: Maintain service catalog
- **Client Management**: Manage client accounts
- **Role Promotion**: Grant admin rights to technicians

### Authentication Flow
1. **Public Access**: Home, Services, About, Contact pages
2. **Dashboard Redirect**: Clicking "Dashboard" checks authentication
3. **Role-Based Routing**: Redirects to appropriate dashboard based on role
4. **Admin Path**: `/admin` shows registration/login for administrators

### Security Features
- **AWS Cognito Integration**: Secure authentication service
- **JWT Tokens**: Secure API communication
- **Role Hierarchy**: Admin > Technician > Client permissions
- **Protected Routes**: Dashboard access requires authentication
- **Custom Attributes**: Role and permission data in Cognito

## 📁 File Structure

```
src/
├── types/database.ts              # TypeScript interfaces
├── services/
│   ├── authService.ts            # Authentication logic
│   └── enhancedDatabaseService.ts # Database operations
├── contexts/
│   └── EnhancedAuthContext.tsx   # Auth state management
├── components/
│   └── AdminRegistration.tsx     # Admin signup/signin
├── pages/
│   ├── AdminDashboard.tsx        # Admin management interface
│   └── SimpleDashboard.tsx       # Basic dashboard for other roles
└── config/aws-config.ts          # AWS configuration
```

## ⚙️ Configuration Required

### 1. Environment Variables
Copy `.env.example` to `.env` and configure:
```bash
VITE_AWS_REGION=us-east-1
VITE_AWS_USER_POOL_ID=your-user-pool-id
VITE_AWS_USER_POOL_CLIENT_ID=your-client-id
VITE_AWS_IDENTITY_POOL_ID=your-identity-pool-id
VITE_API_ENDPOINT=your-api-gateway-url
```

### 2. AWS Services Setup
- **Amazon Cognito**: User authentication with custom attributes
- **Amazon RDS**: PostgreSQL/MySQL database for persistent storage
- **API Gateway**: RESTful API endpoints for database operations
- **Lambda Functions**: Serverless backend processing

### 3. Required Custom Attributes in Cognito
- `custom:role` - User role (admin/technician/client)
- `custom:isFirstAdmin` - Boolean for first admin flag
- `custom:createdByAdmin` - Boolean for admin-created users

## 🔄 User Flows

### Admin Registration/Login
1. Navigate to `/admin`
2. If no admins exist → Shows registration form
3. If admins exist → Shows login form
4. First admin requires no email verification
5. Subsequent admins require email confirmation

### Dashboard Access
1. Click "Dashboard" in navigation
2. Check authentication status
3. If not authenticated → Show login options
4. If authenticated → Route to role-specific dashboard

### User Management (Admin)
1. Admin logs in → Admin Dashboard
2. Navigate to "Users" section
3. Add/Edit/Delete users with role assignment
4. Set technician permissions and availability
5. Manage client information and service addresses

## 🎨 UI/UX Features

- **Role-Based Navigation**: Different dashboards per role
- **Responsive Design**: Works on all devices
- **Loading States**: Smooth transitions during authentication
- **Error Handling**: User-friendly error messages
- **Persistence**: Language and page state saved across sessions

## 🔧 Technical Implementation

### Authentication Context
- Role-based permission checking
- Automatic token refresh
- Session persistence
- Real-time auth state updates

### Database Service
- RESTful API integration
- Automatic authentication headers
- Error handling and retry logic
- Typed interfaces for all operations

### Security Measures
- JWT token validation
- Role-based access control
- Protected API endpoints
- Secure password requirements

## 📋 Next Steps

1. **Configure AWS Services**: Set up Cognito, RDS, and API Gateway
2. **Environment Setup**: Add real AWS credentials to `.env`
3. **Database Schema**: Deploy database tables and indexes
4. **API Endpoints**: Implement Lambda functions for database operations
5. **Testing**: Verify all authentication flows and permissions

## 🚀 Getting Started

1. **Start Development Server**: `npm run dev`
2. **Access Site**: http://localhost:5176/
3. **Test Admin Portal**: Navigate to `/admin` in browser
4. **Create First Admin**: Use registration form (no email verification)
5. **Access Dashboard**: Click "Dashboard" after authentication

The system is now ready for AWS configuration and deployment!