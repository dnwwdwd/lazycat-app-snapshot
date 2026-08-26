import { afterEach, describe, expect, it, vi } from 'vitest';
import { pocApi } from './api';

afterEach(() => vi.unstubAllGlobals());

describe('pocApi', () => {
  it('loads same-origin identity diagnostics', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ identityConfigured: true }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(pocApi.identity()).resolves.toEqual({ identityConfigured: true });
    expect(fetchMock).toHaveBeenCalledWith('/api/poc/identity', expect.objectContaining({ credentials: 'same-origin' }));
  });

  it('preserves safe API error codes for the UI', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ code: 'SOURCE_NOT_FOUND', message: 'source is unavailable' }), { status: 404 })));

    await expect(pocApi.source('fixture-b')).rejects.toMatchObject({ status: 404, code: 'SOURCE_NOT_FOUND' });
  });
});
