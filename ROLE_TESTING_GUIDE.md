# Role-Based Service Request Access Testing Guide

This guide demonstrates how to test the role-based service request access system in the demo application.

## Setup

1. The development server is running on http://localhost:5176/
2. All role-based authentication is implemented using mock data for demonstration purposes
3. AWS configuration is disabled for demo mode

## Testing Different User Roles

### 1. Admin User Testing
- **Email**: Use any email that doesn't contain "tech" or "client" (e.g., `admin@test.com`)
- **Password**: Any password (mock authentication)
- **Access**: Can see all service requests across all clients
- **Features**:
  - View all service requests in Service Requests section
  - Filter by status, client, and date range
  - Manage users, services, and clients
  - Full administrative access

### 2. Technician User Testing
- **Email**: Use email containing "tech" or "technician" (e.g., `jane.tech@test.com`)
- **Password**: Any password (mock authentication)
- **Access**: Can only see service requests assigned to them
- **Features**:
  - View only assigned service requests
  - Task checklist for each request
  - Schedule management
  - Profile management

### 3. Client User Testing
- **Email**: Use email containing "client" (e.g., `client@test.com`)
- **Password**: Any password (mock authentication)
- **Access**: Can only see their own service requests
- **Features**:
  - View only own service requests
  - Request new services
  - View billing and invoices
  - Manage company profile

## Testing Procedure

### Step 1: Test Admin Access
1. Navigate to http://localhost:5176/admin
2. Sign in with admin credentials (e.g., `admin@test.com` / `password`)
3. Navigate to "Service Requests" section
4. Verify you can see all 4 mock service requests from different clients
5. Test filtering by:
   - Status (pending, assigned, in_progress, completed)
   - Client (ABC Company, XYZ Corp)
   - Date range
6. Verify summary stats update based on filters

### Step 2: Test Technician Access
1. Sign out and go to http://localhost:5176/dashboard
2. Sign in with technician credentials (e.g., `jane.tech@test.com` / `password`)
3. Verify you only see 3 service requests assigned to "Jane Tech" (technician ID: 2)
4. Verify task checklists are functional
5. Test status filtering (should only filter within assigned requests)

### Step 3: Test Client Access
1. Sign out and go to http://localhost:5176/dashboard
2. Sign in with client credentials (e.g., `client@test.com` / `password`)
3. Verify you only see 3 service requests for "ABC Company" (client ID: 1)
4. Test status filtering (should only filter within own requests)
5. Verify cost information shows both estimated and actual costs

### Step 4: Test Navigation and Persistence
1. Test language switching (English/Spanish) persists across page reloads
2. Test page persistence when reloading the browser
3. Test navigation between different dashboard sections
4. Verify proper role-based UI elements (different sidebar navigation for each role)

## Expected Results

### Admin Dashboard
- **Total Requests**: 4 (across all clients)
- **Service Requests Visible**: All requests from both ABC Company and XYZ Corp
- **Navigation**: Overview, Users, Services, Clients, Service Requests, Reports
- **Filtering**: Full access to all filter options

### Technician Dashboard
- **Total Assignments**: 3 (only assigned to Jane Tech)
- **Service Requests Visible**: Only requests with technicianId: "2"
- **Navigation**: My Assignments, Schedule, Profile
- **Features**: Task checklists, completion tracking

### Client Dashboard
- **Total Requests**: 3 (only for ABC Company)
- **Service Requests Visible**: Only requests with clientId: "1"
- **Navigation**: My Requests, New Request, Billing, Profile
- **Features**: Request tracking, cost information, service history

## Mock Data Summary

The system includes the following test data:

**Service Requests**:
1. Network Setup (ABC Company) - In Progress - Assigned to Jane Tech
2. Computer Virus Removal (XYZ Corp) - Pending - Unassigned
3. Printer Installation (ABC Company) - Completed - Assigned to Jane Tech
4. Emergency Server Recovery (XYZ Corp) - Assigned - Unassigned
5. Software Update Support (XYZ Corp) - Assigned - Assigned to Jane Tech
6. Monthly Maintenance (ABC Company) - Pending - Unassigned

**Users**:
- Admin User (ID: 1, Role: admin)
- Jane Tech (ID: 2, Role: technician)
- Client User (ID: 3, Role: client, represents ABC Company)

## Security Verification

The role-based access control ensures:

1. **Data Isolation**: Each role only sees appropriate data
2. **Function Restriction**: Role-specific features and navigation
3. **UI Adaptation**: Different interfaces based on user role
4. **Filter Scoping**: Filters only work within user's accessible data

## Demo Mode Notice

This is a demonstration system with:
- Mock authentication (no real password validation)
- Simulated database operations
- Local state management
- AWS services disabled for demo purposes

For production deployment, enable AWS Cognito and RDS integration as documented in the codebase.