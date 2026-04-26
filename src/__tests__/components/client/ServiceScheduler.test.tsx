import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import ServiceScheduler from '../../../components/client/ServiceScheduler';
import { ClientThemeProvider } from '../../../contexts/ClientThemeContext';
import { ClientLanguageProvider } from '../../../contexts/ClientLanguageContext';

global.fetch = jest.fn();

// Mock ResourceTimeSlotScheduler — only rendered conditionally inside a modal,
// but we mock it anyway so its imports never load real-fetch code paths.
jest.mock('../../../components/client/ResourceTimeSlotScheduler', () => {
  return function MockResourceTimeSlotScheduler(props: any) {
    return (
      <div data-testid="resource-time-slot-scheduler">
        <div data-testid="selected-date">{props.selectedDate?.toDateString()}</div>
      </div>
    );
  };
});

const renderWithProviders = (component: React.ReactElement) =>
  render(
    <ClientLanguageProvider>
      <ClientThemeProvider>{component}</ClientThemeProvider>
    </ClientLanguageProvider>
  );

/**
 * The view-toggle buttons render translation keys like `calendar.views.today`.
 * In tests there are no DB translations loaded — `t()` returns the last
 * segment of the key (lowercase). So expect 'today', 'month', 'week', 'year'.
 */
const VIEW_TODAY = 'today';
const VIEW_MONTH = 'month';
const VIEW_WEEK = 'week';
const VIEW_YEAR = 'year';
const ACTIVE_CLASS = 'bg-blue-600';

describe('ServiceScheduler - calendar view toggle', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ success: true, data: [] }),
    });
  });

  it('renders all four calendar view buttons', async () => {
    renderWithProviders(<ServiceScheduler />);
    await waitFor(() => {
      expect(screen.getByText(VIEW_YEAR)).toBeInTheDocument();
      expect(screen.getByText(VIEW_MONTH)).toBeInTheDocument();
      expect(screen.getByText(VIEW_WEEK)).toBeInTheDocument();
      expect(screen.getByText(VIEW_TODAY)).toBeInTheDocument();
    });
  });

  it('Today button has expected styling classes', async () => {
    renderWithProviders(<ServiceScheduler />);
    await waitFor(() => {
      const todayBtn = screen.getByText(VIEW_TODAY);
      expect(todayBtn).toHaveClass('px-3', 'py-1', 'rounded', 'text-sm', 'font-medium');
    });
  });

  it('defaults to month view (month button highlighted)', async () => {
    renderWithProviders(<ServiceScheduler />);
    await waitFor(() => {
      expect(screen.getByText(VIEW_MONTH)).toHaveClass(ACTIVE_CLASS);
    });
  });

  it('Switching to week view highlights the week button', async () => {
    renderWithProviders(<ServiceScheduler />);
    await waitFor(() => {
      expect(screen.getByText(VIEW_WEEK)).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText(VIEW_WEEK));

    await waitFor(() => {
      expect(screen.getByText(VIEW_WEEK)).toHaveClass(ACTIVE_CLASS);
    });
  });

  it('Today click returns to month view (highlights month button)', async () => {
    renderWithProviders(<ServiceScheduler />);
    await waitFor(() => {
      expect(screen.getByText(VIEW_TODAY)).toBeInTheDocument();
    });

    // Move away from month view first.
    fireEvent.click(screen.getByText(VIEW_WEEK));
    await waitFor(() => {
      expect(screen.getByText(VIEW_WEEK)).toHaveClass(ACTIVE_CLASS);
    });

    // Today button should reset to month view.
    fireEvent.click(screen.getByText(VIEW_TODAY));
    await waitFor(() => {
      expect(screen.getByText(VIEW_MONTH)).toHaveClass(ACTIVE_CLASS);
      expect(screen.getByText(VIEW_WEEK)).not.toHaveClass(ACTIVE_CLASS);
    });
  });

  it('Year button highlights and stays highlighted until view changes', async () => {
    renderWithProviders(<ServiceScheduler />);
    await waitFor(() => {
      expect(screen.getByText(VIEW_YEAR)).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText(VIEW_YEAR));
    await waitFor(() => {
      expect(screen.getByText(VIEW_YEAR)).toHaveClass(ACTIVE_CLASS);
    });
  });
});
