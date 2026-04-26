import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';

// Mock services BEFORE importing the component under test
jest.mock('../../../services/adminService');
jest.mock('../../../services/systemSettingsService', () => ({
  systemSettingsService: {
    getSystemSetting: jest.fn(),
    updateSystemSetting: jest.fn(),
    getAllSystemSettings: jest.fn(),
    getSessionConfig: jest.fn(),
    updateSessionConfig: jest.fn(),
  },
}));
jest.mock('../../../contexts/EnhancedAuthContext');

import AdminSettings from '../../../components/admin/AdminSettings';
import { useEnhancedAuth } from '../../../contexts/EnhancedAuthContext';
import { ThemeProvider } from '../../../contexts/ThemeContext';
import { systemSettingsService } from '../../../services/systemSettingsService';

const mockUseEnhancedAuth = useEnhancedAuth as jest.MockedFunction<typeof useEnhancedAuth>;
const mockedSystemSettings = systemSettingsService as jest.Mocked<typeof systemSettingsService>;

const renderWithTheme = (component: React.ReactElement) => {
  return render(<ThemeProvider>{component}</ThemeProvider>);
};

describe('AdminSettings - Scheduler Configuration', () => {
  beforeEach(() => {
    jest.clearAllMocks();

    mockUseEnhancedAuth.mockReturnValue({
      sessionConfig: { timeout: 15, warningTime: 2 },
      updateSessionConfig: jest.fn(),
    } as any);

    // Default: getSystemSetting resolves to a setting object with value '2'
    mockedSystemSettings.getSystemSetting.mockImplementation(async (key: string) => ({
      key,
      value: 2,
      type: 'number',
      description: '',
      updatedAt: new Date().toISOString(),
    }));

    mockedSystemSettings.updateSystemSetting.mockResolvedValue({
      key: 'x',
      value: 0,
      type: 'number',
      description: '',
      updatedAt: new Date().toISOString(),
    });

    jest.spyOn(console, 'error').mockImplementation();
    jest.spyOn(console, 'log').mockImplementation();
    jest.spyOn(console, 'warn').mockImplementation();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('renders scheduler configuration section', async () => {
    renderWithTheme(<AdminSettings />);

    await waitFor(() => {
      expect(screen.getAllByText('Scheduler Configuration').length).toBeGreaterThan(0);
    });

    expect(
      screen.getByText('Configure buffer times and scheduling constraints for appointment booking')
    ).toBeInTheDocument();
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
      expect(mockedSystemSettings.getSystemSetting).toHaveBeenCalledWith(
        'scheduler_buffer_before_hours'
      );
    });
  });

  it('handles input changes and marks form as dirty', async () => {
    renderWithTheme(<AdminSettings />);

    await waitFor(() => {
      expect(screen.getByLabelText('Buffer Before Appointment (hours)')).toBeInTheDocument();
    });

    const bufferBeforeInput = screen.getByLabelText('Buffer Before Appointment (hours)');
    fireEvent.change(bufferBeforeInput, { target: { value: '3' } });

    expect(bufferBeforeInput).toHaveValue(3);

    const saveButton = screen.getByText('Save Scheduler Settings');
    expect(saveButton).not.toHaveAttribute('disabled');
  });

  it('saves scheduler configuration when save button is clicked', async () => {
    renderWithTheme(<AdminSettings />);

    await waitFor(() => {
      expect(screen.getByLabelText('Buffer Before Appointment (hours)')).toBeInTheDocument();
    });

    const bufferBeforeInput = screen.getByLabelText('Buffer Before Appointment (hours)');
    fireEvent.change(bufferBeforeInput, { target: { value: '3' } });

    const saveButton = screen.getByText('Save Scheduler Settings');
    fireEvent.click(saveButton);

    await waitFor(() => {
      expect(mockedSystemSettings.updateSystemSetting).toHaveBeenCalledWith(
        'scheduler_buffer_before_hours',
        3
      );
    });
  });

  it('resets scheduler configuration to defaults', async () => {
    // Load with non-default value first.
    mockedSystemSettings.getSystemSetting.mockImplementation(async (key: string) => ({
      key,
      value: 7,
      type: 'number',
      description: '',
      updatedAt: new Date().toISOString(),
    }));

    renderWithTheme(<AdminSettings />);

    await waitFor(() => {
      const input = screen.getByLabelText('Buffer Before Appointment (hours)') as HTMLInputElement;
      expect(input.value).toBe('7');
    });

    // Multiple "Reset to Defaults" buttons exist (scheduler + service location);
    // pick the one nearest the scheduler section by walking up to find it.
    const resetButtons = screen.getAllByText('Reset to Defaults');
    const schedulerInput = screen.getByLabelText(
      'Buffer Before Appointment (hours)'
    ) as HTMLInputElement;
    const schedulerSection = schedulerInput.closest('div[class*="space-y"]');
    const schedulerReset =
      resetButtons.find((btn) => schedulerSection?.contains(btn)) || resetButtons[0];
    fireEvent.click(schedulerReset);

    await waitFor(() => {
      const input = screen.getByLabelText('Buffer Before Appointment (hours)') as HTMLInputElement;
      expect(input.value).toBe('2');
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
      const input = screen.getByLabelText('Buffer Before Appointment (hours)');
      expect(input).toHaveAttribute('min', '0');
      expect(input).toHaveAttribute('max', '24');
    });

    const minimumAdvanceInput = screen.getByLabelText('Minimum Advance Notice (hours)');
    expect(minimumAdvanceInput).toHaveAttribute('min', '0');
    expect(minimumAdvanceInput).toHaveAttribute('max', '168');
  });

  it('shows loading state during save operation', async () => {
    let resolveUpdate: ((value: any) => void) | undefined;
    mockedSystemSettings.updateSystemSetting.mockImplementation(
      () => new Promise((resolve) => { resolveUpdate = resolve; })
    );

    renderWithTheme(<AdminSettings />);

    await waitFor(() => {
      expect(screen.getByLabelText('Buffer Before Appointment (hours)')).toBeInTheDocument();
    });

    const bufferBeforeInput = screen.getByLabelText('Buffer Before Appointment (hours)');
    fireEvent.change(bufferBeforeInput, { target: { value: '3' } });

    const saveButton = screen.getByText('Save Scheduler Settings');
    fireEvent.click(saveButton);

    await waitFor(() => {
      expect(screen.getByText('Saving...')).toBeInTheDocument();
    });

    // Resolve so we don't leak the pending promise into the next test.
    if (resolveUpdate) resolveUpdate({});
  });

  it('handles save errors gracefully', async () => {
    mockedSystemSettings.updateSystemSetting.mockRejectedValue(new Error('Network error'));

    renderWithTheme(<AdminSettings />);

    await waitFor(() => {
      expect(screen.getByLabelText('Buffer Before Appointment (hours)')).toBeInTheDocument();
    });

    const bufferBeforeInput = screen.getByLabelText('Buffer Before Appointment (hours)');
    fireEvent.change(bufferBeforeInput, { target: { value: '3' } });

    const saveButton = screen.getByText('Save Scheduler Settings');
    fireEvent.click(saveButton);

    // The component shows an error status after a failed save.
    await waitFor(() => {
      expect(console.error).toHaveBeenCalledWith(
        expect.stringContaining('Error'),
        expect.any(Error)
      );
    });
  });
});
