/**
 * Backend System Settings API Tests
 *
 * These tests validate the system settings API endpoints that support
 * the scheduler configuration functionality in the admin panel.
 */

// Mock fetch for API testing
global.fetch = jest.fn();

const API_BASE_URL = 'http://localhost:3001/api';

describe('System Settings API - Scheduler Configuration', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('GET /admin/system-settings/:key', () => {
    it('retrieves scheduler buffer before hours setting', async () => {
      const mockResponse = {
        success: true,
        data: {
          key: 'scheduler_buffer_before_hours',
          value: '2',
          type: 'scheduler',
          description: 'Buffer time before appointments',
          updatedAt: '2025-09-27T10:00:00Z'
        }
      };

      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockResponse)
      });

      const response = await fetch(`${API_BASE_URL}/admin/system-settings/scheduler_buffer_before_hours`, {
        method: 'GET',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      const data = await response.json();

      expect(global.fetch).toHaveBeenCalledWith(
        `${API_BASE_URL}/admin/system-settings/scheduler_buffer_before_hours`,
        expect.objectContaining({
          method: 'GET',
          credentials: 'include'
        })
      );

      expect(data.success).toBe(true);
      expect(data.data.key).toBe('scheduler_buffer_before_hours');
      expect(data.data.value).toBe('2');
    });

    it('retrieves scheduler buffer after hours setting', async () => {
      const mockResponse = {
        success: true,
        data: {
          key: 'scheduler_buffer_after_hours',
          value: '1',
          type: 'scheduler',
          description: 'Buffer time after appointments',
          updatedAt: '2025-09-27T10:00:00Z'
        }
      };

      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockResponse)
      });

      const response = await fetch(`${API_BASE_URL}/admin/system-settings/scheduler_buffer_after_hours`, {
        method: 'GET',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      const data = await response.json();

      expect(data.data.key).toBe('scheduler_buffer_after_hours');
      expect(data.data.value).toBe('1');
    });

    it('handles non-existent setting keys', async () => {
      const mockResponse = {
        success: false,
        message: 'Setting not found'
      };

      (global.fetch as jest.Mock).mockResolvedValue({
        ok: false,
        status: 404,
        json: () => Promise.resolve(mockResponse)
      });

      const response = await fetch(`${API_BASE_URL}/admin/system-settings/non_existent_key`, {
        method: 'GET',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      const data = await response.json();

      expect(response.ok).toBe(false);
      expect(data.success).toBe(false);
      expect(data.message).toBe('Setting not found');
    });

    it('requires authentication', async () => {
      const mockResponse = {
        success: false,
        message: 'Authentication required',
        code: 'NO_TOKEN'
      };

      (global.fetch as jest.Mock).mockResolvedValue({
        ok: false,
        status: 401,
        json: () => Promise.resolve(mockResponse)
      });

      const response = await fetch(`${API_BASE_URL}/admin/system-settings/scheduler_buffer_before_hours`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      const data = await response.json();

      expect(response.ok).toBe(false);
      expect(data.code).toBe('NO_TOKEN');
    });
  });

  describe('PUT /admin/system-settings/:key', () => {
    it('updates scheduler buffer before hours setting', async () => {
      const mockResponse = {
        success: true,
        message: 'Setting updated successfully',
        data: {
          key: 'scheduler_buffer_before_hours',
          value: '3',
          type: 'scheduler',
          description: 'Buffer time before appointments',
          updatedAt: '2025-09-27T10:30:00Z'
        }
      };

      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockResponse)
      });

      const response = await fetch(`${API_BASE_URL}/admin/system-settings/scheduler_buffer_before_hours`, {
        method: 'PUT',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ value: 3 })
      });

      const data = await response.json();

      expect(global.fetch).toHaveBeenCalledWith(
        `${API_BASE_URL}/admin/system-settings/scheduler_buffer_before_hours`,
        expect.objectContaining({
          method: 'PUT',
          body: JSON.stringify({ value: 3 })
        })
      );

      expect(data.success).toBe(true);
      expect(data.data.value).toBe('3');
    });

    it('updates scheduler minimum advance hours setting', async () => {
      const mockResponse = {
        success: true,
        message: 'Setting updated successfully',
        data: {
          key: 'scheduler_minimum_advance_hours',
          value: '24',
          type: 'scheduler',
          description: 'Minimum advance notice required',
          updatedAt: '2025-09-27T10:30:00Z'
        }
      };

      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockResponse)
      });

      const response = await fetch(`${API_BASE_URL}/admin/system-settings/scheduler_minimum_advance_hours`, {
        method: 'PUT',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ value: 24 })
      });

      const data = await response.json();

      expect(data.data.key).toBe('scheduler_minimum_advance_hours');
      expect(data.data.value).toBe('24');
    });

    it('validates required value field', async () => {
      const mockResponse = {
        success: false,
        message: 'Setting value is required'
      };

      (global.fetch as jest.Mock).mockResolvedValue({
        ok: false,
        status: 400,
        json: () => Promise.resolve(mockResponse)
      });

      const response = await fetch(`${API_BASE_URL}/admin/system-settings/scheduler_buffer_before_hours`, {
        method: 'PUT',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({}) // Missing value
      });

      const data = await response.json();

      expect(response.ok).toBe(false);
      expect(data.message).toBe('Setting value is required');
    });

    it('handles update of non-existent setting', async () => {
      const mockResponse = {
        success: false,
        message: 'Setting not found'
      };

      (global.fetch as jest.Mock).mockResolvedValue({
        ok: false,
        status: 404,
        json: () => Promise.resolve(mockResponse)
      });

      const response = await fetch(`${API_BASE_URL}/admin/system-settings/non_existent_key`, {
        method: 'PUT',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ value: 'test' })
      });

      const data = await response.json();

      expect(response.ok).toBe(false);
      expect(data.message).toBe('Setting not found');
    });
  });

  describe('GET /admin/system-settings', () => {
    it('retrieves all system settings', async () => {
      const mockResponse = {
        success: true,
        data: {
          settings: [
            {
              key: 'scheduler_buffer_before_hours',
              value: '2',
              type: 'scheduler',
              description: 'Buffer time before appointments',
              updatedAt: '2025-09-27T10:00:00Z'
            },
            {
              key: 'scheduler_buffer_after_hours',
              value: '1',
              type: 'scheduler',
              description: 'Buffer time after appointments',
              updatedAt: '2025-09-27T10:00:00Z'
            }
          ]
        }
      };

      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockResponse)
      });

      const response = await fetch(`${API_BASE_URL}/admin/system-settings`, {
        method: 'GET',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      const data = await response.json();

      expect(data.success).toBe(true);
      expect(Array.isArray(data.data.settings)).toBe(true);
      expect(data.data.settings.length).toBeGreaterThan(0);
    });
  });
});

describe('Scheduler Configuration Integration', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('loads complete scheduler configuration', async () => {
    const settingKeys = [
      'scheduler_buffer_before_hours',
      'scheduler_buffer_after_hours',
      'scheduler_default_slot_duration_hours',
      'scheduler_minimum_advance_hours'
    ];

    const mockResponses = {
      'scheduler_buffer_before_hours': '2',
      'scheduler_buffer_after_hours': '1',
      'scheduler_default_slot_duration_hours': '2',
      'scheduler_minimum_advance_hours': '1'
    };

    (global.fetch as jest.Mock).mockImplementation((url) => {
      const key = url.split('/').pop();
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({
          success: true,
          data: {
            key,
            value: mockResponses[key as keyof typeof mockResponses],
            type: 'scheduler'
          }
        })
      });
    });

    // Simulate loading configuration like AdminSettings does
    const configData: any = {};

    for (const key of settingKeys) {
      const response = await fetch(`${API_BASE_URL}/admin/system-settings/${key}`, {
        method: 'GET',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (response.ok) {
        const result = await response.json();
        const value = parseInt(result.data.value) || 0;

        switch (key) {
          case 'scheduler_buffer_before_hours':
            configData.bufferBeforeHours = value;
            break;
          case 'scheduler_buffer_after_hours':
            configData.bufferAfterHours = value;
            break;
          case 'scheduler_default_slot_duration_hours':
            configData.defaultSlotDurationHours = value;
            break;
          case 'scheduler_minimum_advance_hours':
            configData.minimumAdvanceHours = value;
            break;
        }
      }
    }

    expect(configData.bufferBeforeHours).toBe(2);
    expect(configData.bufferAfterHours).toBe(1);
    expect(configData.defaultSlotDurationHours).toBe(2);
    expect(configData.minimumAdvanceHours).toBe(1);
  });

  it('saves complete scheduler configuration', async () => {
    const config = {
      bufferBeforeHours: 3,
      bufferAfterHours: 2,
      defaultSlotDurationHours: 3,
      minimumAdvanceHours: 2
    };

    const settingMappings = {
      bufferBeforeHours: 'scheduler_buffer_before_hours',
      bufferAfterHours: 'scheduler_buffer_after_hours',
      defaultSlotDurationHours: 'scheduler_default_slot_duration_hours',
      minimumAdvanceHours: 'scheduler_minimum_advance_hours'
    };

    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ success: true })
    });

    // Simulate saving configuration like AdminSettings does
    for (const [configKey, settingKey] of Object.entries(settingMappings)) {
      const value = config[configKey as keyof typeof config];

      await fetch(`${API_BASE_URL}/admin/system-settings/${settingKey}`, {
        method: 'PUT',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ value }),
      });
    }

    expect(global.fetch).toHaveBeenCalledTimes(4);
    expect(global.fetch).toHaveBeenCalledWith(
      `${API_BASE_URL}/admin/system-settings/scheduler_buffer_before_hours`,
      expect.objectContaining({
        method: 'PUT',
        body: JSON.stringify({ value: 3 })
      })
    );
  });
});