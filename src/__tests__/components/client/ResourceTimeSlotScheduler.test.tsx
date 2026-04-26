import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import ResourceTimeSlotScheduler from '../../../components/client/ResourceTimeSlotScheduler';
import { ClientThemeProvider } from '../../../contexts/ClientThemeContext';
import { ClientLanguageProvider } from '../../../contexts/ClientLanguageContext';

// Mock apiService — used by the component for rate tiers, bookings, etc.
// Different endpoints expect different `data` shapes; route per URL.
jest.mock('../../../services/apiService', () => ({
  apiService: {
    get: jest.fn().mockImplementation((url: string) => {
      if (url.includes('rate-tiers')) {
        return Promise.resolve({ success: true, data: [] });
      }
      if (url.includes('bookings')) {
        return Promise.resolve({ success: true, data: [] });
      }
      if (url.includes('first-timer')) {
        return Promise.resolve({ success: true, data: { isFirstTimer: false } });
      }
      if (url.includes('hourly-rate')) {
        return Promise.resolve({
          success: true,
          data: { hourlyRate: 100, rateCategoryName: 'Standard' },
        });
      }
      return Promise.resolve({ success: true, data: [] });
    }),
    post: jest.fn().mockResolvedValue({ success: true }),
    put: jest.fn(),
    delete: jest.fn(),
  },
}));

// Provide a stable timezone helper output so we don't rely on the host TZ.
jest.mock('../../../utils/timezoneUtils', () => ({
  getUserTimezone: () => 'America/Los_Angeles',
  getTimezoneDisplayName: () => 'Pacific Time',
  timezoneService: {
    getBusinessDayAndTime: () => ({ dayOfWeek: 1, timeString: '09:00:00' }),
  },
}));

global.fetch = jest.fn();

const renderWithProviders = (component: React.ReactElement) =>
  render(
    <ClientLanguageProvider>
      <ClientThemeProvider>{component}</ClientThemeProvider>
    </ClientLanguageProvider>
  );

const baseProps = {
  onSlotSelect: jest.fn(),
  onDateChange: jest.fn(),
  onClose: jest.fn(),
  businessId: 'business-1',
  initialDuration: 1,
  initialTierPreference: 'any' as const,
};

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(console, 'error').mockImplementation();
  jest.spyOn(console, 'warn').mockImplementation();
  jest.spyOn(console, 'log').mockImplementation();
  (global.fetch as jest.Mock).mockResolvedValue({
    ok: true,
    json: () => Promise.resolve({ success: true, data: [] }),
  });
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('ResourceTimeSlotScheduler — smoke tests', () => {
  it('renders without crashing for a future date', async () => {
    const future = new Date();
    future.setDate(future.getDate() + 7);
    renderWithProviders(
      <ResourceTimeSlotScheduler {...baseProps} selectedDate={future} />
    );
    // The scheduler title comes from `t('scheduler.title', ..., 'Schedule Appointment')`.
    // With no DB translations loaded, t() returns the last segment of the key
    // ("title") OR the fallback if provided. The component supplies a fallback,
    // so we expect the literal fallback string.
    await waitFor(() => {
      expect(screen.getByText('Schedule Appointment')).toBeInTheDocument();
    });
  });

  it('shows past-date overlay text when given yesterday', async () => {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    renderWithProviders(
      <ResourceTimeSlotScheduler {...baseProps} selectedDate={yesterday} />
    );

    await waitFor(() => {
      expect(screen.getByText('Past Date Selected')).toBeInTheDocument();
    });
  });

  it('does not show past-date overlay for today', async () => {
    const today = new Date();
    renderWithProviders(
      <ResourceTimeSlotScheduler {...baseProps} selectedDate={today} />
    );

    // Component finishes initial render quickly; assert the overlay is absent.
    await waitFor(() => {
      expect(screen.queryByText('Past Date Selected')).not.toBeInTheDocument();
    });
  });

  it('does not show past-date overlay for a future date', async () => {
    const future = new Date();
    future.setDate(future.getDate() + 14);
    renderWithProviders(
      <ResourceTimeSlotScheduler {...baseProps} selectedDate={future} />
    );

    await waitFor(() => {
      expect(screen.queryByText('Past Date Selected')).not.toBeInTheDocument();
    });
  });

  it('renders close button (close action wired up)', async () => {
    const today = new Date();
    renderWithProviders(
      <ResourceTimeSlotScheduler {...baseProps} selectedDate={today} />
    );

    // The close button uses an aria-label fallback "Close scheduler".
    await waitFor(() => {
      const closeBtn = screen.getByLabelText('Close scheduler');
      expect(closeBtn).toBeInTheDocument();
    });
  });
});
