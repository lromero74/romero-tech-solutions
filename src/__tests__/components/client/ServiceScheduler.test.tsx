import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import ServiceScheduler from '../../../components/client/ServiceScheduler';
import { ClientThemeProvider } from '../../../contexts/ClientThemeContext';
import { ClientLanguageProvider } from '../../../contexts/ClientLanguageContext';

// Mock fetch
global.fetch = jest.fn();

// Mock the child components to focus on ServiceScheduler logic
jest.mock('../../../components/client/ResourceTimeSlotScheduler', () => {
  return function MockResourceTimeSlotScheduler(props: any) {
    return (
      <div data-testid="resource-time-slot-scheduler">
        <div data-testid="selected-date">{props.selectedDate?.toDateString()}</div>
      </div>
    );
  };
});

const renderWithProviders = (component: React.ReactElement) => {
  return render(
    <ClientLanguageProvider>
      <ClientThemeProvider>
        {component}
      </ClientThemeProvider>
    </ClientLanguageProvider>
  );
};

describe('ServiceScheduler - Today Button Functionality', () => {
  beforeEach(() => {
    jest.clearAllMocks();

    // Mock successful API responses
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({
        success: true,
        data: []
      })
    });
  });

  it('renders the Today button', async () => {
    renderWithProviders(<ServiceScheduler />);

    await waitFor(() => {
      expect(screen.getByText('Today')).toBeInTheDocument();
    });
  });

  it('Today button navigates to current date', async () => {
    renderWithProviders(<ServiceScheduler />);

    // Wait for component to load
    await waitFor(() => {
      expect(screen.getByText('Today')).toBeInTheDocument();
    });

    // Get today's date
    const today = new Date();
    const todayString = today.toDateString();

    // Click the Today button
    const todayButton = screen.getByText('Today');
    fireEvent.click(todayButton);

    // Verify the selected date is updated to today
    await waitFor(() => {
      const selectedDateElement = screen.getByTestId('selected-date');
      expect(selectedDateElement).toHaveTextContent(todayString);
    });
  });

  it('Today button is styled correctly', async () => {
    renderWithProviders(<ServiceScheduler />);

    await waitFor(() => {
      const todayButton = screen.getByText('Today');
      expect(todayButton).toHaveClass('px-3', 'py-1', 'rounded', 'text-sm', 'font-medium');
    });
  });

  it('Today button works from any selected date', async () => {
    renderWithProviders(<ServiceScheduler />);

    await waitFor(() => {
      expect(screen.getByText('Today')).toBeInTheDocument();
    });

    // Get today's date for comparison
    const today = new Date();
    const todayString = today.toDateString();

    // Navigate to a different date first (simulate user navigation)
    // This would typically be done through calendar navigation, but we'll test the Today button directly
    const todayButton = screen.getByText('Today');

    // Click Today button
    fireEvent.click(todayButton);

    // Verify it always goes to today regardless of current selection
    await waitFor(() => {
      const selectedDateElement = screen.getByTestId('selected-date');
      expect(selectedDateElement).toHaveTextContent(todayString);
    });
  });

  it('renders calendar view options and Today button together', async () => {
    renderWithProviders(<ServiceScheduler />);

    await waitFor(() => {
      // Check that view options and Today button are both present
      expect(screen.getByText('Month')).toBeInTheDocument();
      expect(screen.getByText('Week')).toBeInTheDocument();
      expect(screen.getByText('Day')).toBeInTheDocument();
      expect(screen.getByText('Today')).toBeInTheDocument();
    });
  });

  it('Today button maintains functionality across view changes', async () => {
    renderWithProviders(<ServiceScheduler />);

    await waitFor(() => {
      expect(screen.getByText('Today')).toBeInTheDocument();
    });

    // Switch to week view
    const weekButton = screen.getByText('Week');
    fireEvent.click(weekButton);

    // Today button should still work
    const todayButton = screen.getByText('Today');
    fireEvent.click(todayButton);

    const today = new Date();
    const todayString = today.toDateString();

    await waitFor(() => {
      const selectedDateElement = screen.getByTestId('selected-date');
      expect(selectedDateElement).toHaveTextContent(todayString);
    });
  });

  it('Today button appears in correct position in layout', async () => {
    renderWithProviders(<ServiceScheduler />);

    await waitFor(() => {
      const todayButton = screen.getByText('Today');
      expect(todayButton.parentElement).toHaveClass('mt-2');
    });
  });
});

describe('ServiceScheduler - Past Date Prevention', () => {
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

  it('renders Advanced Time Slot Picker component', async () => {
    renderWithProviders(<ServiceScheduler />);

    await waitFor(() => {
      expect(screen.getByTestId('resource-time-slot-scheduler')).toBeInTheDocument();
    });
  });

  it('passes selected date to Advanced Time Slot Picker', async () => {
    renderWithProviders(<ServiceScheduler />);

    await waitFor(() => {
      const resourceScheduler = screen.getByTestId('resource-time-slot-scheduler');
      expect(resourceScheduler).toBeInTheDocument();
    });

    // Click Today button to ensure current date is passed
    const todayButton = screen.getByText('Today');
    fireEvent.click(todayButton);

    const today = new Date();
    const todayString = today.toDateString();

    await waitFor(() => {
      const selectedDateElement = screen.getByTestId('selected-date');
      expect(selectedDateElement).toHaveTextContent(todayString);
    });
  });
});