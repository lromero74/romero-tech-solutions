import React from 'react';
import {
  Users,
  UserPlus,
  Briefcase,
  Settings,
  FileText,
  BarChart3,
  Plus,
  Bell
} from 'lucide-react';
import { themeClasses } from '../../contexts/ThemeContext';
import PushNotificationManager from '../PushNotificationManager';

type AdminView = 'overview' | 'employees' | 'clients' | 'services' | 'service-requests' | 'reports';

interface DashboardData {
  statistics: {
    totalUsers: number;
    totalClients: number;
    totalAdmins: number;
    totalBusinesses: number;
  };
  recentUsers: unknown[];
  userTrends: unknown[];
}

interface AdminOverviewProps {
  dashboardData: DashboardData | null;
  setCurrentView: (view: AdminView) => void;
}

const AdminOverview: React.FC<AdminOverviewProps> = ({
  dashboardData,
  setCurrentView
}) => {
  const stats = [
    {
      label: 'Total Users',
      value: dashboardData?.statistics?.totalUsers || 0,
      icon: Users,
      color: 'blue'
    },
    {
      label: 'Total Clients',
      value: dashboardData?.statistics?.totalClients || 0,
      icon: Briefcase,
      color: 'green'
    },
    {
      label: 'Total Admins',
      value: dashboardData?.statistics?.totalAdmins || 0,
      icon: UserPlus,
      color: 'purple'
    },
    {
      label: 'Total Businesses',
      value: dashboardData?.statistics?.totalBusinesses || 0,
      icon: Settings,
      color: 'orange'
    },
    {
      label: 'Recent Users (30d)',
      value: dashboardData?.recentUsers?.length || 0,
      icon: FileText,
      color: 'red'
    },
    {
      label: 'User Trends (7d)',
      value: dashboardData?.userTrends?.length || 0,
      icon: BarChart3,
      color: 'indigo'
    }
  ];

  return (
    <div className="space-y-6">
      <h1 className={`text-3xl font-bold ${themeClasses.text.primary}`}>Admin Dashboard</h1>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {stats.map((stat, index) => (
          <div key={index} className={`${themeClasses.bg.card} overflow-hidden ${themeClasses.shadow.md} rounded-lg`}>
            <div className="p-5">
              <div className="flex items-center">
                <div className="flex-shrink-0">
                  <stat.icon className={`h-6 w-6 text-${stat.color}-600`} />
                </div>
                <div className="ml-5 w-0 flex-1">
                  <dl>
                    <dt className={`text-sm font-medium ${themeClasses.text.secondary} truncate`}>{stat.label}</dt>
                    <dd className={`text-lg font-medium ${themeClasses.text.primary}`}>{stat.value}</dd>
                  </dl>
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Quick Actions */}
      <div className={`${themeClasses.bg.card} ${themeClasses.shadow.md} rounded-lg p-6`}>
        <h2 className={`text-lg font-medium ${themeClasses.text.primary} mb-4`}>Quick Actions</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <button
            onClick={() => setCurrentView('employees')}
            className="flex items-center justify-center px-4 py-3 border border-transparent text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700"
          >
            <UserPlus className="w-5 h-5 mr-2" />
            Manage Employees
          </button>
          <button
            onClick={() => setCurrentView('services')}
            className="flex items-center justify-center px-4 py-3 border border-transparent text-sm font-medium rounded-md text-white bg-green-600 hover:bg-green-700"
          >
            <Plus className="w-5 h-5 mr-2" />
            Add Service
          </button>
          <button
            onClick={() => setCurrentView('clients')}
            className="flex items-center justify-center px-4 py-3 border border-transparent text-sm font-medium rounded-md text-white bg-purple-600 hover:bg-purple-700"
          >
            <Briefcase className="w-5 h-5 mr-2" />
            Manage Clients
          </button>
        </div>
      </div>

      {/* Push Notification Settings */}
      <div className={`${themeClasses.bg.card} ${themeClasses.shadow.md} rounded-lg p-6`}>
        <h2 className={`text-lg font-medium ${themeClasses.text.primary} mb-4 flex items-center gap-2`}>
          <Bell className="w-5 h-5" />
          Push Notifications
        </h2>
        <PushNotificationManager />
      </div>
    </div>
  );
};

export default AdminOverview;