import React, { useState } from 'react';
import { useEnhancedAuth } from '../contexts/EnhancedAuthContext';
import {
  ClipboardList,
  Calendar,
  Clock,
  User,
  MapPin,
  Phone,
  Mail,
  CheckSquare,
  Square,
  LogOut,
  Wrench,
  AlertCircle,
  Filter
} from 'lucide-react';

type TechnicianView = 'assigned' | 'schedule' | 'profile';

const MockTechnicianDashboard: React.FC = () => {
  const { user, signOut } = useEnhancedAuth();
  const [currentView, setCurrentView] = useState<TechnicianView>('assigned');
  const [statusFilter, setStatusFilter] = useState<string>('all');

  // Mock data for current technician (Jane Tech - ID: 2)
  const technicianId = '2';

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
      contactPerson: 'John Smith',
      contactPhone: '(555) 123-4567',
      serviceAddress: {
        street: '123 Business Ave',
        city: 'Downtown',
        state: 'CA',
        zipCode: '90210'
      },
      tasks: [
        { id: 1, description: 'Configure main router', completed: true },
        { id: 2, description: 'Set up WiFi network', completed: true },
        { id: 3, description: 'Install security protocols', completed: false },
        { id: 4, description: 'Test connectivity', completed: false },
        { id: 5, description: 'Train staff on network usage', completed: false }
      ]
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
      estimatedHours: 2,
      estimatedCost: 150,
      contactPerson: 'John Smith',
      contactPhone: '(555) 123-4567',
      serviceAddress: {
        street: '123 Business Ave',
        city: 'Downtown',
        state: 'CA',
        zipCode: '90210'
      },
      tasks: [
        { id: 1, description: 'Unbox and setup printers', completed: true },
        { id: 2, description: 'Connect to network', completed: true },
        { id: 3, description: 'Install drivers on workstations', completed: true },
        { id: 4, description: 'Test print functionality', completed: true }
      ]
    },
    {
      id: '5',
      clientId: '2',
      clientName: 'XYZ Corp',
      technicianId: '2',
      technicianName: 'Jane Tech',
      title: 'Software Update Support',
      description: 'Assist with company-wide software updates and troubleshooting',
      status: 'assigned' as const,
      priority: 'medium' as const,
      urgency: 'routine' as const,
      requestedDate: '2024-01-19',
      scheduledDate: '2024-01-22',
      estimatedHours: 6,
      estimatedCost: 450,
      contactPerson: 'Sarah Johnson',
      contactPhone: '(555) 987-6543',
      serviceAddress: {
        street: '456 Corporate Blvd',
        city: 'Business District',
        state: 'CA',
        zipCode: '90211'
      },
      tasks: [
        { id: 1, description: 'Backup critical data', completed: false },
        { id: 2, description: 'Update operating systems', completed: false },
        { id: 3, description: 'Update business applications', completed: false },
        { id: 4, description: 'Test system functionality', completed: false }
      ]
    }
  ];

  // Filter service requests for this technician
  const getMyServiceRequests = () => {
    return mockServiceRequests.filter(request => {
      if (request.technicianId !== technicianId) return false;

      if (statusFilter !== 'all' && request.status !== statusFilter) {
        return false;
      }

      return true;
    });
  };

  const toggleTask = (requestId: string, taskId: number) => {
    // In a real app, this would update the database
    console.log(`Toggle task ${taskId} in request ${requestId}`);
  };

  const renderSidebar = () => (
    <div className="w-64 bg-white shadow-md h-screen flex flex-col">
      {/* User Info */}
      <div className="p-6 border-b">
        <div className="flex items-center">
          <div className="w-10 h-10 bg-blue-600 rounded-full flex items-center justify-center">
            <Wrench className="w-6 h-6 text-white" />
          </div>
          <div className="ml-3">
            <p className="text-sm font-medium text-gray-900">{user?.name}</p>
            <p className="text-xs text-gray-500">Technician (Demo)</p>
          </div>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-4 py-6">
        <div className="space-y-2">
          {[
            { id: 'assigned', label: 'My Assignments', icon: ClipboardList },
            { id: 'schedule', label: 'Schedule', icon: Calendar },
            { id: 'profile', label: 'Profile', icon: User }
          ].map((item) => (
            <button
              key={item.id}
              onClick={() => setCurrentView(item.id as TechnicianView)}
              className={`w-full flex items-center px-3 py-2 text-sm font-medium rounded-md transition-colors ${
                currentView === item.id
                  ? 'bg-blue-100 text-blue-900'
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

  const renderAssignedRequests = () => (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-bold text-gray-900">My Service Assignments (Demo)</h1>
        <div className="flex items-center space-x-4">
          <div className="flex items-center">
            <Filter className="w-4 h-4 mr-2 text-gray-500" />
            <select
              className="border-gray-300 rounded-md text-sm"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
            >
              <option value="all">All Status</option>
              <option value="assigned">Assigned</option>
              <option value="in_progress">In Progress</option>
              <option value="completed">Completed</option>
            </select>
          </div>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white p-4 rounded-lg shadow">
          <div className="text-sm font-medium text-gray-500">Total Assignments</div>
          <div className="text-2xl font-bold text-gray-900">{getMyServiceRequests().length}</div>
        </div>
        <div className="bg-white p-4 rounded-lg shadow">
          <div className="text-sm font-medium text-gray-500">In Progress</div>
          <div className="text-2xl font-bold text-blue-600">
            {getMyServiceRequests().filter(r => r.status === 'in_progress').length}
          </div>
        </div>
        <div className="bg-white p-4 rounded-lg shadow">
          <div className="text-sm font-medium text-gray-500">Completed</div>
          <div className="text-2xl font-bold text-green-600">
            {getMyServiceRequests().filter(r => r.status === 'completed').length}
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
                  'bg-yellow-100 text-yellow-800'
                }`}>
                  {request.status.replace('_', ' ')}
                </span>
                <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                  request.priority === 'high' ? 'bg-red-100 text-red-800' :
                  request.priority === 'medium' ? 'bg-yellow-100 text-yellow-800' :
                  'bg-green-100 text-green-800'
                }`}>
                  {request.priority}
                </span>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
              <div>
                <h4 className="text-sm font-medium text-gray-900 mb-2">Client Information</h4>
                <div className="space-y-1 text-sm text-gray-600">
                  <div className="flex items-center">
                    <User className="w-4 h-4 mr-2" />
                    {request.clientName}
                  </div>
                  <div className="flex items-center">
                    <Phone className="w-4 h-4 mr-2" />
                    {request.contactPhone}
                  </div>
                  <div className="flex items-center">
                    <MapPin className="w-4 h-4 mr-2" />
                    {request.serviceAddress.street}, {request.serviceAddress.city}
                  </div>
                </div>
              </div>

              <div>
                <h4 className="text-sm font-medium text-gray-900 mb-2">Schedule</h4>
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
                  <div className="flex items-center">
                    <AlertCircle className="w-4 h-4 mr-2" />
                    Est. {request.estimatedHours} hours
                  </div>
                </div>
              </div>
            </div>

            {/* Task Checklist */}
            <div>
              <h4 className="text-sm font-medium text-gray-900 mb-3">Task Checklist</h4>
              <div className="space-y-2">
                {request.tasks.map((task) => (
                  <div key={task.id} className="flex items-center">
                    <button
                      onClick={() => toggleTask(request.id, task.id)}
                      className="mr-3 text-blue-600 hover:text-blue-800"
                    >
                      {task.completed ? (
                        <CheckSquare className="w-5 h-5" />
                      ) : (
                        <Square className="w-5 h-5" />
                      )}
                    </button>
                    <span className={`text-sm ${
                      task.completed ? 'text-gray-500 line-through' : 'text-gray-900'
                    }`}>
                      {task.description}
                    </span>
                  </div>
                ))}
              </div>
              <div className="mt-3 text-xs text-gray-500">
                {request.tasks.filter(t => t.completed).length} of {request.tasks.length} tasks completed
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );

  const renderSchedule = () => (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold text-gray-900">My Schedule (Demo)</h1>
      <div className="bg-white shadow rounded-lg p-6">
        <p className="text-gray-600">Schedule management coming soon...</p>
        <p className="text-sm text-gray-500 mt-2">This will show your upcoming appointments and availability.</p>
      </div>
    </div>
  );

  const renderProfile = () => (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold text-gray-900">Profile (Demo)</h1>
      <div className="bg-white shadow rounded-lg p-6">
        <p className="text-gray-600">Profile management coming soon...</p>
        <p className="text-sm text-gray-500 mt-2">This will show your skills, certifications, and contact information.</p>
      </div>
    </div>
  );

  const renderCurrentView = () => {
    switch (currentView) {
      case 'assigned':
        return renderAssignedRequests();
      case 'schedule':
        return renderSchedule();
      case 'profile':
        return renderProfile();
      default:
        return renderAssignedRequests();
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

export default MockTechnicianDashboard;