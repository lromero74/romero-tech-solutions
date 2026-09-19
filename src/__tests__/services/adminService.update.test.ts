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

describe('adminService.createServiceRequest', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('POSTs /admin/service-requests with the payload', async () => {
    mockedApi.post.mockResolvedValue({
      success: true,
      data: { id: 'sr-1', request_number: 'SR-2026-00001' },
    } as any);
    const payload = {
      title: 'Fix sink',
      business_id: 'b1',
      client_id: 'c1',
      service_location_id: 'l1',
    };
    const result = await adminService.createServiceRequest(payload);
    expect(mockedApi.post).toHaveBeenCalledWith('/admin/service-requests', payload);
    expect(result).toEqual({ id: 'sr-1', request_number: 'SR-2026-00001' });
  });
});

describe('adminService.updateService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('PUTs /admin/services/:id with partial updates', async () => {
    mockedApi.put.mockResolvedValue({
      success: true,
      data: { service: { id: 'svc-1', name: 'Renamed' } },
    } as any);
    const result = await adminService.updateService('svc-1', { name: 'Renamed' });
    expect(mockedApi.put).toHaveBeenCalledWith('/admin/services/svc-1', { name: 'Renamed' });
    expect(result).toEqual({ id: 'svc-1', name: 'Renamed' });
  });
});

describe('adminService.deleteService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('DELETEs /admin/services/:id', async () => {
    mockedApi.delete.mockResolvedValue({ success: true } as any);
    await adminService.deleteService('svc-1');
    expect(mockedApi.delete).toHaveBeenCalledWith('/admin/services/svc-1');
  });
});

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
