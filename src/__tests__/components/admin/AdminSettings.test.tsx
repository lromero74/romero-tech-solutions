import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import AdminSettings from '../../../components/admin/AdminSettings';
import { useEnhancedAuth } from '../../../contexts/EnhancedAuthContext';
import { ThemeProvider } from '../../../contexts/ThemeContext';

// Mock the contexts
jest.mock('../../../contexts/EnhancedAuthContext');
jest.mock('../../../services/adminService');

// Mock fetch
global.fetch = jest.fn();

const mockUseEnhancedAuth = useEnhancedAuth as jest.MockedFunction<typeof useEnhancedAuth>;

const renderWithTheme = (component: React.ReactElement) => {
  return render(
    <ThemeProvider>
      {component}
    </ThemeProvider>
  );
};

describe('AdminSettings - Scheduler Configuration', () => {
  beforeEach(() => {
    jest.clearAllMocks();

    mockUseEnhancedAuth.mockReturnValue({
      sessionConfig: { timeout: 15, warningTime: 2 },
      updateSessionConfig: jest.fn(),
    } as any);

    // Mock successful fetch responses
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({
        success: true,
        data: { value: '2' }
      })
    });
  });

  it('renders scheduler configuration section', async () => {
    renderWithTheme(<AdminSettings />);

    await waitFor(() => {
      expect(screen.getByText('Scheduler Configuration')).toBeInTheDocument();
    });

    expect(screen.getByText('Configure buffer times and scheduling constraints for appointment booking')).toBeInTheDocument();
  });

  it('displays all scheduler configuration fields', async () => {
    renderWithTheme(<AdminSettings />);

    await waitFor(() => {
      expect(screen.getByLabelText('Buffer Before Appointment (hours)')).toBeInTheDocument();
      expect(screen.getByLabelText('Buffer After Appointment (hours)')).toBeInTheDocument();
      expect(screen.getByLabelText('Default Slot Duration (hours)')).toBeInTheDocument();
      expect(screen.getByLabelText('Minimum Advance Notice (hours)')).toBeInTheDocument();
    });
  });

  it('loads scheduler configuration on mount', async () => {
    renderWithTheme(<AdminSettings />);

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/admin/system-settings/scheduler_buffer_before_hours'),
        expect.objectContaining({
          method: 'GET',
          credentials: 'include'
        })
      );
    });
  });

  it('handles input changes and marks form as dirty', async () => {
    renderWithTheme(<AdminSettings />);

    await waitFor(() => {
      const bufferBeforeInput = screen.getByLabelText('Buffer Before Appointment (hours)');
      expect(bufferBeforeInput).toBeInTheDocument();
    });

    const bufferBeforeInput = screen.getByLabelText('Buffer Before Appointment (hours)');
    fireEvent.change(bufferBeforeInput, { target: { value: '3' } });

    await waitFor(() => {
      expect(bufferBeforeInput).toHaveValue(3);
    });

    // Check that save button becomes enabled
    const saveButton = screen.getByText('Save Scheduler Settings');
    expect(saveButton).not.toHaveAttribute('disabled');
  });

  it('saves scheduler configuration when save button is clicked', async () => {
    renderWithTheme(<AdminSettings />);

    await waitFor(() => {
      const bufferBeforeInput = screen.getByLabelText('Buffer Before Appointment (hours)');
      fireEvent.change(bufferBeforeInput, { target: { value: '3' } });
    });

    const saveButton = screen.getByText('Save Scheduler Settings');
    fireEvent.click(saveButton);

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/admin/system-settings/scheduler_buffer_before_hours'),
        expect.objectContaining({
          method: 'PUT',
          body: JSON.stringify({ value: 3 })
        })
      );
    });
  });

  it('resets scheduler configuration to defaults', async () => {
    renderWithTheme(<AdminSettings />);

    await waitFor(() => {
      const resetButton = screen.getByText('Reset to Defaults');
      expect(resetButton).toBeInTheDocument();
    });

    const resetButton = screen.getByText('Reset to Defaults');
    fireEvent.click(resetButton);

    await waitFor(() => {
      const bufferBeforeInput = screen.getByLabelText('Buffer Before Appointment (hours)') as HTMLInputElement;
      expect(bufferBeforeInput.value).toBe('2');
    });
  });

  it('displays current settings summary', async () => {
    renderWithTheme(<AdminSettings />);

    await waitFor(() => {
      expect(screen.getByText('Current Scheduler Settings Summary')).toBeInTheDocument();
      expect(screen.getByText(/Buffer before appointments:/)).toBeInTheDocument();
      expect(screen.getByText(/Buffer after appointments:/)).toBeInTheDocument();
      expect(screen.getByText(/Default slot duration:/)).toBeInTheDocument();
      expect(screen.getByText(/Minimum advance notice:/)).toBeInTheDocument();
    });
  });

  it('validates input constraints', async () => {
    renderWithTheme(<AdminSettings />);

    await waitFor(() => {
      const bufferBeforeInput = screen.getByLabelText('Buffer Before Appointment (hours)');
      expect(bufferBeforeInput).toHaveAttribute('min', '0');
      expect(bufferBeforeInput).toHaveAttribute('max', '24');
    });

    const minimumAdvanceInput = screen.getByLabelText('Minimum Advance Notice (hours)');
    expect(minimumAdvanceInput).toHaveAttribute('min', '0');
    expect(minimumAdvanceInput).toHaveAttribute('max', '168');
  });

  it('shows loading state during save operation', async () => {
    // Mock delayed response
    (global.fetch as jest.Mock).mockImplementation(() =>
      new Promise(resolve =>
        setTimeout(() => resolve({
          ok: true,
          json: () => Promise.resolve({ success: true })
        }), 100)
      )
    );

    renderWithTheme(<AdminSettings />);

    await waitFor(() => {
      const bufferBeforeInput = screen.getByLabelText('Buffer Before Appointment (hours)');
      fireEvent.change(bufferBeforeInput, { target: { value: '3' } });
    });

    const saveButton = screen.getByText('Save Scheduler Settings');
    fireEvent.click(saveButton);

    await waitFor(() => {
      expect(screen.getByText('Saving...')).toBeInTheDocument();
    });
  });

  it('handles save errors gracefully', async () => {
    // Mock error response
    (global.fetch as jest.Mock).mockRejectedValue(new Error('Network error'));

    renderWithTheme(<AdminSettings />);

    await waitFor(() => {
      const bufferBeforeInput = screen.getByLabelText('Buffer Before Appointment (hours)');
      fireEvent.change(bufferBeforeInput, { target: { value: '3' } });
    });

    const saveButton = screen.getByText('Save Scheduler Settings');
    fireEvent.click(saveButton);

    await waitFor(() => {
      expect(screen.getByText('Error')).toBeInTheDocument();
    });
  });
});