import React, { useState } from 'react';
import { useEnhancedAuth } from '../contexts/EnhancedAuthContext';
import {
  ClipboardList,
  Calendar,
  Clock,
  User,
  MapPin,
  Phone,
  Settings,
  LogOut,
  Building,
  AlertCircle,
  Plus,
  Filter,
  DollarSign
} from 'lucide-react';

type ClientView = 'requests' | 'new-request' | 'profile' | 'billing';

const MockClientDashboard: React.FC = () => {
  const { user, signOut } = useEnhancedAuth();
  const [currentView, setCurrentView] = useState<ClientView>('requests');
  const [statusFilter, setStatusFilter] = useState<string>('all');

  // Mock data for current client (Client User - ID: 3, actually using clientId: 1 for demo data)
  const clientId = '1'; // Using client ID 1 to show some requests

  const mockServiceRequests = [
    {
      id: '1',
      clientId: '1',
      clientName: 'ABC Company',
      technicianId: '2',
      technicianName: 'Jane Tech',
      title: 'Network Setup Required',
      description: 'Setting up new office network infrastructure including router configuration and security setup',
      status: 'in_progress' as const,
      priority: 'high' as const,
      urgency: 'urgent' as const,
      requestedDate: '2024-01-15',
      scheduledDate: '2024-01-18',
      estimatedHours: 8,
      estimatedCost: 600,
      actualCost: undefined,
      contactPerson: 'John Smith',
      contactPhone: '(555) 123-4567',
      serviceAddress: {
        street: '123 Business Ave',
        city: 'Downtown',
        state: 'CA',
        zipCode: '90210'
      },
      notes: 'Please ensure minimal disruption during business hours. Access available through back entrance.'
    },
    {
      id: '3',
      clientId: '1',
      clientName: 'ABC Company',
      technicianId: '2',
      technicianName: 'Jane Tech',
      title: 'Printer Installation',
      description: 'Install and configure new office printers with network connectivity',
      status: 'completed' as const,
      priority: 'low' as const,
      urgency: 'routine' as const,
      requestedDate: '2024-01-10',
      scheduledDate: '2024-01-12',
      completedDate: '2024-01-12',
      estimatedHours: 2,
      estimatedCost: 150,
      actualCost: 125,
      contactPerson: 'John Smith',
      contactPhone: '(555) 123-4567',
      serviceAddress: {
        street: '123 Business Ave',
        city: 'Downtown',
        state: 'CA',
        zipCode: '90210'
      },
      notes: 'Completed successfully. All printers configured and tested.'
    },
    {
      id: '6',
      clientId: '1',
      clientName: 'ABC Company',
      technicianId: undefined,
      technicianName: undefined,
      title: 'Monthly Maintenance Check',
      description: 'Routine monthly maintenance of IT infrastructure',
      status: 'pending' as const,
      priority: 'low' as const,
      urgency: 'routine' as const,
      requestedDate: '2024-01-20',
      scheduledDate: undefined,
      estimatedHours: 4,
      estimatedCost: 300,
      actualCost: undefined,
      contactPerson: 'John Smith',
      contactPhone: '(555) 123-4567',
      serviceAddress: {
        street: '123 Business Ave',
        city: 'Downtown',
        state: 'CA',
        zipCode: '90210'
      },
      notes: 'Regular maintenance scheduled for end of month'
    }
  ];

  // Filter service requests for this client
  const getMyServiceRequests = () => {
    return mockServiceRequests.filter(request => {
      if (request.clientId !== clientId) return false;

      if (statusFilter !== 'all' && request.status !== statusFilter) {
        return false;
      }

      return true;
    });
  };

  const renderSidebar = () => (
    <div className="w-64 bg-white shadow-md h-screen flex flex-col">
      {/* User Info */}
      <div className="p-6 border-b">
        <div className="flex items-center">
          <div className="w-10 h-10 bg-green-600 rounded-full flex items-center justify-center">
            <Building className="w-6 h-6 text-white" />
          </div>
          <div className="ml-3">
            <p className="text-sm font-medium text-gray-900">{user?.name}</p>
            <p className="text-xs text-gray-500">Client (Demo)</p>
          </div>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-4 py-6">
        <div className="space-y-2">
          {[
            { id: 'requests', label: 'My Requests', icon: ClipboardList },
            { id: 'new-request', label: 'New Request', icon: Plus },
            { id: 'billing', label: 'Billing', icon: DollarSign },
            { id: 'profile', label: 'Profile', icon: User }
          ].map((item) => (
            <button
              key={item.id}
              onClick={() => setCurrentView(item.id as ClientView)}
              className={`w-full flex items-center px-3 py-2 text-sm font-medium rounded-md transition-colors ${
                currentView === item.id
                  ? 'bg-green-100 text-green-900'
                  : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
              }`}
            >
              <item.icon className="w-5 h-5 mr-3" />
              {item.label}
            </button>
          ))}
        </div>
      </nav>

      {/* Demo Notice */}
      <div className="p-4 border-t bg-yellow-50">
        <p className="text-xs text-yellow-800 font-medium">Demo Mode</p>
        <p className="text-xs text-yellow-700">AWS configuration required for full functionality</p>
      </div>

      {/* Sign Out */}
      <div className="p-4 border-t">
        <button
          onClick={signOut}
          className="w-full flex items-center px-3 py-2 text-sm font-medium text-red-600 hover:bg-red-50 rounded-md transition-colors"
        >
          <LogOut className="w-5 h-5 mr-3" />
          Sign Out
        </button>
      </div>
    </div>
  );

  const renderMyRequests = () => (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-bold text-gray-900">My Service Requests (Demo)</h1>
        <div className="flex items-center space-x-4">
          <div className="flex items-center">
            <Filter className="w-4 h-4 mr-2 text-gray-500" />
            <select
              className="border-gray-300 rounded-md text-sm"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
            >
              <option value="all">All Status</option>
              <option value="pending">Pending</option>
              <option value="assigned">Assigned</option>
              <option value="in_progress">In Progress</option>
              <option value="completed">Completed</option>
            </select>
          </div>
          <button
            onClick={() => setCurrentView('new-request')}
            className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-green-600 hover:bg-green-700"
          >
            <Plus className="w-4 h-4 mr-2" />
            New Request
          </button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-white p-4 rounded-lg shadow">
          <div className="text-sm font-medium text-gray-500">Total Requests</div>
          <div className="text-2xl font-bold text-gray-900">{getMyServiceRequests().length}</div>
        </div>
        <div className="bg-white p-4 rounded-lg shadow">
          <div className="text-sm font-medium text-gray-500">Pending</div>
          <div className="text-2xl font-bold text-orange-600">
            {getMyServiceRequests().filter(r => r.status === 'pending').length}
          </div>
        </div>
        <div className="bg-white p-4 rounded-lg shadow">
          <div className="text-sm font-medium text-gray-500">In Progress</div>
          <div className="text-2xl font-bold text-blue-600">
            {getMyServiceRequests().filter(r => r.status === 'in_progress').length}
          </div>
        </div>
        <div className="bg-white p-4 rounded-lg shadow">
          <div className="text-sm font-medium text-gray-500">Total Cost</div>
          <div className="text-2xl font-bold text-green-600">
            ${getMyServiceRequests().reduce((sum, r) => sum + (r.actualCost || r.estimatedCost), 0).toLocaleString()}
          </div>
        </div>
      </div>

      {/* Service Requests */}
      <div className="space-y-4">
        {getMyServiceRequests().map((request) => (
          <div key={request.id} className="bg-white rounded-lg shadow p-6">
            <div className="flex justify-between items-start mb-4">
              <div>
                <h3 className="text-lg font-medium text-gray-900">{request.title}</h3>
                <p className="text-sm text-gray-600">{request.description}</p>
              </div>
              <div className="flex items-center space-x-2">
                <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                  request.status === 'completed' ? 'bg-green-100 text-green-800' :
                  request.status === 'in_progress' ? 'bg-blue-100 text-blue-800' :
                  request.status === 'assigned' ? 'bg-yellow-100 text-yellow-800' :
                  'bg-gray-100 text-gray-800'
                }`}>
                  {request.status.replace('_', ' ')}
                </span>
                <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                  request.priority === 'high' ? 'bg-red-100 text-red-800' :
                  request.priority === 'medium' ? 'bg-yellow-100 text-yellow-800' :
                  'bg-green-100 text-green-800'
                }`}>
                  {request.priority} priority
                </span>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
              <div>
                <h4 className="text-sm font-medium text-gray-900 mb-2">Service Details</h4>
                <div className="space-y-1 text-sm text-gray-600">
                  <div className="flex items-center">
                    <Calendar className="w-4 h-4 mr-2" />
                    Requested: {new Date(request.requestedDate).toLocaleDateString()}
                  </div>
                  {request.scheduledDate && (
                    <div className="flex items-center">
                      <Clock className="w-4 h-4 mr-2" />
                      Scheduled: {new Date(request.scheduledDate).toLocaleDateString()}
                    </div>
                  )}
                  {request.completedDate && (
                    <div className="flex items-center">
                      <Clock className="w-4 h-4 mr-2 text-green-600" />
                      Completed: {new Date(request.completedDate).toLocaleDateString()}
                    </div>
                  )}
                </div>
              </div>

              <div>
                <h4 className="text-sm font-medium text-gray-900 mb-2">Assignment & Cost</h4>
                <div className="space-y-1 text-sm text-gray-600">
                  <div className="flex items-center">
                    <User className="w-4 h-4 mr-2" />
                    {request.technicianName || 'Unassigned'}
                  </div>
                  <div className="flex items-center">
                    <AlertCircle className="w-4 h-4 mr-2" />
                    Est. {request.estimatedHours} hours
                  </div>
                  <div className="flex items-center">
                    <DollarSign className="w-4 h-4 mr-2" />
                    {request.actualCost ? `$${request.actualCost} (Final)` : `$${request.estimatedCost} (Est.)`}
                  </div>
                </div>
              </div>
            </div>

            <div className="flex justify-between items-center">
              <div className="flex items-center text-sm text-gray-500">
                <MapPin className="w-4 h-4 mr-1" />
                {request.serviceAddress.street}, {request.serviceAddress.city}
              </div>

              {request.status !== 'completed' && (
                <div className="flex space-x-2">
                  <button className="text-blue-600 hover:text-blue-800 text-sm font-medium">
                    Contact Support
                  </button>
                  {request.status === 'pending' && (
                    <button className="text-red-600 hover:text-red-800 text-sm font-medium">
                      Cancel Request
                    </button>
                  )}
                </div>
              )}
            </div>

            {request.notes && (
              <div className="mt-4 p-3 bg-gray-50 rounded-lg">
                <p className="text-sm text-gray-700">
                  <strong>Notes:</strong> {request.notes}
                </p>
              </div>
            )}
          </div>
        ))}

        {getMyServiceRequests().length === 0 && (
          <div className="text-center py-12">
            <ClipboardList className="mx-auto h-12 w-12 text-gray-400" />
            <h3 className="mt-2 text-sm font-medium text-gray-900">No service requests</h3>
            <p className="mt-1 text-sm text-gray-500">Get started by creating your first service request.</p>
            <div className="mt-6">
              <button
                onClick={() => setCurrentView('new-request')}
                className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-green-600 hover:bg-green-700"
              >
                <Plus className="w-4 h-4 mr-2" />
                New Service Request
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );

  const renderNewRequest = () => (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold text-gray-900">New Service Request (Demo)</h1>
      <div className="bg-white shadow rounded-lg p-6">
        <p className="text-gray-600">Service request form coming soon...</p>
        <p className="text-sm text-gray-500 mt-2">This will allow clients to submit new service requests with all required details.</p>
      </div>
    </div>
  );

  const renderBilling = () => (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold text-gray-900">Billing & Invoices (Demo)</h1>
      <div className="bg-white shadow rounded-lg p-6">
        <p className="text-gray-600">Billing management coming soon...</p>
        <p className="text-sm text-gray-500 mt-2">This will show invoices, payment history, and billing details.</p>
      </div>
    </div>
  );

  const renderProfile = () => (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold text-gray-900">Company Profile (Demo)</h1>
      <div className="bg-white shadow rounded-lg p-6">
        <p className="text-gray-600">Profile management coming soon...</p>
        <p className="text-sm text-gray-500 mt-2">This will show company information, service addresses, and contact details.</p>
      </div>
    </div>
  );

  const renderCurrentView = () => {
    switch (currentView) {
      case 'requests':
        return renderMyRequests();
      case 'new-request':
        return renderNewRequest();
      case 'billing':
        return renderBilling();
      case 'profile':
        return renderProfile();
      default:
        return renderMyRequests();
    }
  };

  return (
    <div className="flex h-screen bg-gray-100">
      {renderSidebar()}
      <div className="flex-1 overflow-auto">
        <div className="p-8">
          {renderCurrentView()}
        </div>
      </div>
    </div>
  );
};

export default MockClientDashboard;