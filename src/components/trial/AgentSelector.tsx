import React from 'react';
import { Monitor, Server, Laptop, Smartphone, Circle, Clock, HardDrive } from 'lucide-react';
import { AgentDevice } from '../../services/agentService';
import { formatDistanceToNow } from 'date-fns';

interface AgentSelectorProps {
  agents: AgentDevice[];
  selectedAgentId: string;
  onSelectAgent: (agentId: string) => void;
  isDarkMode: boolean;
}

const AgentSelector: React.FC<AgentSelectorProps> = ({
  agents,
  selectedAgentId,
  onSelectAgent,
  isDarkMode
}) => {
  const getDeviceIcon = (deviceType: string) => {
    switch (deviceType?.toLowerCase()) {
      case 'server':
        return <Server className="w-4 h-4" />;
      case 'desktop':
      case 'workstation':
        return <Monitor className="w-4 h-4" />;
      case 'laptop':
        return <Laptop className="w-4 h-4" />;
      case 'mobile':
        return <Smartphone className="w-4 h-4" />;
      default:
        return <HardDrive className="w-4 h-4" />;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'online':
        return 'text-green-600 dark:text-green-400';
      case 'warning':
        return 'text-yellow-600 dark:text-yellow-400';
      case 'critical':
        return 'text-red-600 dark:text-red-400';
      default:
        return 'text-gray-600 dark:text-gray-400';
    }
  };

  const formatLastSeen = (timestamp: string | null): string => {
    if (!timestamp) return 'Never';
    try {
      return formatDistanceToNow(new Date(timestamp), { addSuffix: true });
    } catch {
      return 'Unknown';
    }
  };

  if (agents.length === 0) {
    return null;
  }

  // If only one agent, don't show the selector
  if (agents.length === 1) {
    return null;
  }

  return (
    <div className="mb-6">
      <h3 className={`text-sm font-semibold mb-3 ${isDarkMode ? 'text-gray-200' : 'text-gray-700'}`}>
        Your Devices ({agents.length})
      </h3>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {agents.map((agent) => {
          const isSelected = agent.id === selectedAgentId;
          return (
            <button
              key={agent.id}
              onClick={() => onSelectAgent(agent.id)}
              className={`
                p-3 rounded-lg border-2 text-left transition-all
                ${isSelected
                  ? isDarkMode
                    ? 'border-blue-500 bg-blue-900/30'
                    : 'border-blue-500 bg-blue-50'
                  : isDarkMode
                    ? 'border-gray-700 bg-gray-800 hover:border-gray-600'
                    : 'border-gray-200 bg-white hover:border-gray-300'
                }
              `}
            >
              <div className="flex items-start justify-between mb-2">
                <div className="flex items-center space-x-2">
                  <div className={`${isSelected ? 'text-blue-600 dark:text-blue-400' : 'text-gray-600 dark:text-gray-400'}`}>
                    {getDeviceIcon(agent.device_type)}
                  </div>
                  <span className={`font-medium text-sm ${isDarkMode ? 'text-gray-100' : 'text-gray-900'}`}>
                    {agent.device_name}
                  </span>
                </div>
                <Circle className={`w-3 h-3 fill-current ${getStatusColor(agent.status)}`} />
              </div>

              <div className={`text-xs space-y-1 ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                <div className="flex items-center space-x-1">
                  <span className="capitalize">{agent.os_type}</span>
                  {agent.os_version && (
                    <>
                      <span>•</span>
                      <span>{agent.os_version}</span>
                    </>
                  )}
                </div>
                <div className="flex items-center space-x-1">
                  <Clock className="w-3 h-3" />
                  <span>{formatLastSeen(agent.last_heartbeat)}</span>
                </div>
                {agent.location_name && (
                  <div className="truncate" title={agent.location_name}>
                    📍 {agent.location_name}
                  </div>
                )}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
};

export default AgentSelector;
