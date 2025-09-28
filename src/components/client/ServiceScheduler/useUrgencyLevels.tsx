import { useMemo, createElement } from 'react';
import { Clock, Zap, AlertTriangle } from 'lucide-react';
import { useClientLanguage } from '../../../contexts/ClientLanguageContext';
import { UrgencyLevel } from './types';

export const useUrgencyLevels = () => {
  const { t } = useClientLanguage();

  const urgencyLevels = useMemo<UrgencyLevel[]>(() => [
    {
      id: 'normal',
      level_name: t('schedule.urgency.normal'),
      lead_time_hours: 24,
      priority_multiplier: 1.0,
      description: t('schedule.urgency.normalDesc'),
      icon: <Clock className="h-5 w-5" />,
      color: 'blue'
    },
    {
      id: 'prime',
      level_name: t('schedule.urgency.prime'),
      lead_time_hours: 4,
      priority_multiplier: 1.5,
      description: t('schedule.urgency.primeDesc'),
      icon: <Zap className="h-5 w-5" />,
      color: 'yellow'
    },
    {
      id: 'emergency',
      level_name: t('schedule.urgency.emergency'),
      lead_time_hours: 1,
      priority_multiplier: 2.0,
      description: t('schedule.urgency.emergencyDesc'),
      icon: <AlertTriangle className="h-5 w-5" />,
      color: 'red'
    }
  ], [t]);

  return { urgencyLevels };
};