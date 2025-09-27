import React from 'react';
import { themeClasses } from '../../contexts/ThemeContext';

const AdminServiceRequests: React.FC = () => {

  return (
    <div className="space-y-6">
      <h1 className={`text-3xl font-bold ${themeClasses.text.primary}`}>Service Requests (Demo)</h1>

      <div className={`${themeClasses.bg.card} ${themeClasses.shadow.md} rounded-lg p-6`}>
        <p className={`${themeClasses.text.secondary}`}>Service request management features coming soon...</p>
        <p className={`text-sm ${themeClasses.text.muted} mt-2`}>Configure AWS RDS and API Gateway to enable full service request functionality.</p>
      </div>
    </div>
  );
};

export default AdminServiceRequests;