import React, { useState, useEffect, useCallback } from 'react';
import { User, Crown, Phone, Mail } from 'lucide-react';
import { adminService } from '../../services/adminService';
import { themeClasses } from '../../contexts/ThemeContext';

interface LocationContact {
  id: string;
  service_location_id: string;
  user_id: string;
  contact_role: string;
  is_primary_contact: boolean;
  notes?: string;
  created_at: string;
  updated_at: string;
  user: {
    id: string;
    email: string;
    first_name?: string;
    last_name?: string;
    phone?: string;
    role: string;
  };
}

interface LocationContactsProps {
  serviceLocationId: string;
  showAll?: boolean; // If false, shows only primary contact
}

const LocationContacts: React.FC<LocationContactsProps> = ({
  serviceLocationId,
  showAll = false
}) => {
  const [contacts, setContacts] = useState<LocationContact[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchContacts();
  }, [fetchContacts, serviceLocationId]);

  const fetchContacts = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await adminService.getLocationContacts(serviceLocationId);
      setContacts(response.locationContacts || []);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load contacts');
      console.error('Error fetching location contacts:', err);
    } finally {
      setLoading(false);
    }
  }, [serviceLocationId]);

  const displayContacts = showAll ? contacts : contacts.filter(contact => contact.is_primary_contact).slice(0, 1);

  if (loading) {
    return (
      <div className={`text-xs ${themeClasses.text.muted} flex items-center`}>
        <User className={`w-3 h-3 mr-1 animate-pulse`} />
        Loading...
      </div>
    );
  }

  if (error) {
    return (
      <div className={`text-xs text-red-500 flex items-center`}>
        <User className={`w-3 h-3 mr-1`} />
        Error loading contacts
      </div>
    );
  }

  if (contacts.length === 0) {
    return (
      <div className={`text-xs ${themeClasses.text.muted} flex items-center`}>
        <User className={`w-3 h-3 mr-1`} />
        No contacts
      </div>
    );
  }

  if (!showAll && displayContacts.length === 0) {
    const firstContact = contacts[0];
    return (
      <div className={`text-xs ${themeClasses.text.primary}`}>
        <div className="flex items-center mb-1">
          <User className={`w-3 h-3 ${themeClasses.text.muted} mr-1`} />
          <span>
            {firstContact.user.first_name || firstContact.user.last_name
              ? `${firstContact.user.first_name || ''} ${firstContact.user.last_name || ''}`.trim()
              : firstContact.user.email}
          </span>
        </div>
        {firstContact.user.phone && (
          <div className="flex items-center">
            <Phone className={`w-3 h-3 ${themeClasses.text.muted} mr-1`} />
            <button
              onClick={() => window.open(`tel:${firstContact.user.phone}`, '_self')}
              className={`${themeClasses.text.primary} hover:text-blue-600 transition-colors cursor-pointer underline`}
              title="Click to call this number"
            >
              {firstContact.user.phone}
            </button>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className={`text-xs ${themeClasses.text.primary}`}>
      {displayContacts.map((contact) => (
        <div key={contact.id} className="mb-2 last:mb-0">
          <div className="flex items-center mb-1">
            {contact.is_primary_contact ? (
              <Crown className={`w-3 h-3 text-yellow-500 mr-1`} title="Primary Contact" />
            ) : (
              <User className={`w-3 h-3 ${themeClasses.text.muted} mr-1`} />
            )}
            <span className="font-medium">
              {contact.user.first_name || contact.user.last_name
                ? `${contact.user.first_name || ''} ${contact.user.last_name || ''}`.trim()
                : contact.user.email}
            </span>
          </div>

          {contact.user.email && (
            <div className="flex items-center mb-1">
              <Mail className={`w-3 h-3 ${themeClasses.text.muted} mr-1`} />
              <button
                onClick={() => window.open(`mailto:${contact.user.email}`, '_self')}
                className={`${themeClasses.text.primary} hover:text-blue-600 transition-colors cursor-pointer underline`}
                title="Click to send email"
              >
                {contact.user.email}
              </button>
            </div>
          )}

          {contact.user.phone && (
            <div className="flex items-center">
              <Phone className={`w-3 h-3 ${themeClasses.text.muted} mr-1`} />
              <button
                onClick={() => window.open(`tel:${contact.user.phone}`, '_self')}
                className={`${themeClasses.text.primary} hover:text-blue-600 transition-colors cursor-pointer underline`}
                title="Click to call this number"
              >
                {contact.user.phone}
              </button>
            </div>
          )}
        </div>
      ))}

      {!showAll && contacts.length > 1 && (
        <div className={`text-xs ${themeClasses.text.muted} mt-1`}>
          +{contacts.length - 1} more contact{contacts.length - 1 > 1 ? 's' : ''}
        </div>
      )}
    </div>
  );
};

export default LocationContacts;