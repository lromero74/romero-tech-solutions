import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import ResourceTimeSlotScheduler from '../../../components/client/ResourceTimeSlotScheduler';
import { ClientThemeProvider } from '../../../contexts/ClientThemeContext';
import { ClientLanguageProvider } from '../../../contexts/ClientLanguageContext';

// Mock fetch
global.fetch = jest.fn();

const renderWithProviders = (component: React.ReactElement) => {
  return render(
    <ClientLanguageProvider>
      <ClientThemeProvider>
        {component}
      </ClientThemeProvider>
    </ClientLanguageProvider>
  );
};

describe('ResourceTimeSlotScheduler - Past Date Prevention', () => {
  const mockResources = [
    { id: 1, name: 'Conference Room A', type: 'Meeting Room', description: 'Main conference room', isAvailable: true },
    { id: 2, name: 'Office Space B', type: 'Office', description: 'Private office', isAvailable: true }
  ];

  const mockBookings = [];

  beforeEach(() => {
    jest.clearAllMocks();

    // Mock successful API responses
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({
        success: true,
        data: { resources: mockResources, bookings: mockBookings }
      })
    });
  });

  it('renders without crashing for current date', () => {
    const today = new Date();
    renderWithProviders(
      <ResourceTimeSlotScheduler
        selectedDate={today}
        resources={mockResources}
        bookings={mockBookings}
        onBookingCreate={jest.fn()}
      />
    );

    expect(screen.getByText('Advanced Time Slot Picker')).toBeInTheDocument();
  });

  it('shows past date overlay when past date is selected', async () => {
    const pastDate = new Date();
    pastDate.setDate(pastDate.getDate() - 1); // Yesterday

    renderWithProviders(
      <ResourceTimeSlotScheduler
        selectedDate={pastDate}
        resources={mockResources}
        bookings={mockBookings}
        onBookingCreate={jest.fn()}
      />
    );

    await waitFor(() => {
      expect(screen.getByText('Past Date Selected')).toBeInTheDocument();
      expect(screen.getByText('Cannot schedule appointments for past dates.')).toBeInTheDocument();
      expect(screen.getByText('Please select today or a future date.')).toBeInTheDocument();
    });
  });

  it('does not show past date overlay for current date', async () => {
    const today = new Date();

    renderWithProviders(
      <ResourceTimeSlotScheduler
        selectedDate={today}
        resources={mockResources}
        bookings={mockBookings}
        onBookingCreate={jest.fn()}
      />
    );

    await waitFor(() => {
      expect(screen.queryByText('Past Date Selected')).not.toBeInTheDocument();
    });
  });

  it('does not show past date overlay for future date', async () => {
    const futureDate = new Date();
    futureDate.setDate(futureDate.getDate() + 1); // Tomorrow

    renderWithProviders(
      <ResourceTimeSlotScheduler
        selectedDate={futureDate}
        resources={mockResources}
        bookings={mockBookings}
        onBookingCreate={jest.fn()}
      />
    );

    await waitFor(() => {
      expect(screen.queryByText('Past Date Selected')).not.toBeInTheDocument();
    });
  });

  it('shows AlertCircle icon in past date overlay', async () => {
    const pastDate = new Date();
    pastDate.setDate(pastDate.getDate() - 1);

    renderWithProviders(
      <ResourceTimeSlotScheduler
        selectedDate={pastDate}
        resources={mockResources}
        bookings={mockBookings}
        onBookingCreate={jest.fn()}
      />
    );

    await waitFor(() => {
      const alertIcon = document.querySelector('.lucide-alert-circle');
      expect(alertIcon).toBeInTheDocument();
    });
  });

  it('prevents time slot interaction when past date is selected', async () => {
    const pastDate = new Date();
    pastDate.setDate(pastDate.getDate() - 1);

    renderWithProviders(
      <ResourceTimeSlotScheduler
        selectedDate={pastDate}
        resources={mockResources}
        bookings={mockBookings}
        onBookingCreate={jest.fn()}
      />
    );

    await waitFor(() => {
      // The overlay should have a high z-index to prevent interaction
      const overlay = screen.getByText('Past Date Selected').closest('div');
      expect(overlay).toHaveClass('z-30');
    });
  });

  it('displays today date boundary correctly', async () => {
    // Test with a date that's exactly at the boundary (start of today)
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    renderWithProviders(
      <ResourceTimeSlotScheduler
        selectedDate={today}
        resources={mockResources}
        bookings={mockBookings}
        onBookingCreate={jest.fn()}
      />
    );

    await waitFor(() => {
      expect(screen.queryByText('Past Date Selected')).not.toBeInTheDocument();
    });
  });

  it('correctly identifies past date regardless of time', async () => {
    const pastDate = new Date();
    pastDate.setDate(pastDate.getDate() - 1);
    pastDate.setHours(23, 59, 59, 999); // End of yesterday

    renderWithProviders(
      <ResourceTimeSlotScheduler
        selectedDate={pastDate}
        resources={mockResources}
        bookings={mockBookings}
        onBookingCreate={jest.fn()}
      />
    );

    await waitFor(() => {
      expect(screen.getByText('Past Date Selected')).toBeInTheDocument();
    });
  });

  it('shows proper styling for past date warning', async () => {
    const pastDate = new Date();
    pastDate.setDate(pastDate.getDate() - 1);

    renderWithProviders(
      <ResourceTimeSlotScheduler
        selectedDate={pastDate}
        resources={mockResources}
        bookings={mockBookings}
        onBookingCreate={jest.fn()}
      />
    );

    await waitFor(() => {
      const warningTitle = screen.getByText('Past Date Selected');
      expect(warningTitle).toHaveClass('text-red-700');

      const overlay = warningTitle.closest('div')?.parentElement;
      expect(overlay).toHaveClass('bg-gray-500', 'bg-opacity-75');
    });
  });
});

describe('ResourceTimeSlotScheduler - General Functionality', () => {
  const mockResources = [
    { id: 1, name: 'Conference Room A', type: 'Meeting Room', description: 'Main conference room', isAvailable: true }
  ];

  beforeEach(() => {
    jest.clearAllMocks();

    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({
        success: true,
        data: []
      })
    });
  });

  it('renders time on horizontal axis', async () => {
    const today = new Date();

    renderWithProviders(
      <ResourceTimeSlotScheduler
        selectedDate={today}
        resources={mockResources}
        bookings={[]}
        onBookingCreate={jest.fn()}
      />
    );

    await waitFor(() => {
      expect(screen.getByText('Advanced Time Slot Picker')).toBeInTheDocument();
    });

    // Check that the time grid structure exists
    const timeGrid = document.querySelector('.grid-cols-25');
    expect(timeGrid).toBeInTheDocument();
  });

  it('handles resource scheduling correctly', async () => {
    const mockOnBookingCreate = jest.fn();
    const today = new Date();

    renderWithProviders(
      <ResourceTimeSlotScheduler
        selectedDate={today}
        resources={mockResources}
        bookings={[]}
        onBookingCreate={mockOnBookingCreate}
      />
    );

    await waitFor(() => {
      expect(screen.getByText('Advanced Time Slot Picker')).toBeInTheDocument();
    });

    // Component should be interactive for current/future dates
    expect(screen.queryByText('Past Date Selected')).not.toBeInTheDocument();
  });

  it('displays resources in the scheduler', async () => {
    const today = new Date();

    renderWithProviders(
      <ResourceTimeSlotScheduler
        selectedDate={today}
        resources={mockResources}
        bookings={[]}
        onBookingCreate={jest.fn()}
      />
    );

    await waitFor(() => {
      expect(screen.getByText('Conference Room A')).toBeInTheDocument();
    });
  });
});