import { api, kubiApi } from './api';

// Mock fetch globally
global.fetch = jest.fn();

describe('API Wrapper', () => {
  beforeEach(() => {
    (fetch as jest.Mock).mockClear();
  });

  it('api.get should call fetch with correct URL and headers', async () => {
    (fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => ({ success: true }),
    });

    const result = await api.get('/test');

    expect(fetch).toHaveBeenCalledWith('/api/test', {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    });
    expect(result).toEqual({ success: true });
  });

  it('kubiApi.getIncidents should call api.get with /incidents', async () => {
    const spy = jest.spyOn(api, 'get').mockResolvedValue([]);
    
    await kubiApi.getIncidents();
    
    expect(spy).toHaveBeenCalledWith('/incidents');
    spy.mockRestore();
  });
});
