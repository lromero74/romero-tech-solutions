// Covers the useEntityCRUD TODO: updateServiceRequest must PATCH
// /admin/service-requests/:id/details (backend: serviceRequests/lifecycle.js).
jest.mock('../../services/apiService', () => {
  const mock = {
    get: jest.fn(),
    post: jest.fn(),
    put: jest.fn(),
    delete: jest.fn(),
    patch: jest.fn(),
  };
  return {
    __esModule: true,
    default: mock,
    apiService: mock,
  };
});

import { adminService } from '../../services/adminService';
import { apiService } from '../../services/apiService';

const mockedApi = apiService as jest.Mocked<typeof apiService>;

describe('adminService.updateServiceRequest', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('PATCHes /admin/service-requests/:id/details with title/description', async () => {
    mockedApi.patch.mockResolvedValue({
      success: true,
      data: { id: 'sr-1', title: 'New title' },
    } as any);
    const result = await adminService.updateServiceRequest('sr-1', {
      title: 'New title',
      description: 'New desc',
    });
    expect(mockedApi.patch).toHaveBeenCalledWith('/admin/service-requests/sr-1/details', {
      title: 'New title',
      description: 'New desc',
    });
    expect(result).toEqual({ id: 'sr-1', title: 'New title' });
  });
});
