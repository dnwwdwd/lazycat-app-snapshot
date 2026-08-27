import { afterEach, describe, expect, it, vi } from 'vitest';
import { PLATFORM_RESOLVER_NO_PROJECTION, pocApi } from './api';

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

  it('preserves the platform projection gap code', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ code: PLATFORM_RESOLVER_NO_PROJECTION, message: PLATFORM_RESOLVER_NO_PROJECTION }), { status: 412 })));

    await expect(pocApi.source('deploy-a')).rejects.toMatchObject({ status: 412, code: PLATFORM_RESOLVER_NO_PROJECTION });
  });

  it('loads the tenant application catalog and source capability', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ catalogReady: true, providerKind: 'fixture' }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ applications: [], count: 0 }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(pocApi.sourceCapability()).resolves.toMatchObject({ providerKind: 'fixture' });
    await expect(pocApi.applications()).resolves.toMatchObject({ count: 0 });
    expect(fetchMock.mock.calls[0][0]).toBe('/api/poc/source-capability');
    expect(fetchMock.mock.calls[1][0]).toBe('/api/poc/applications');
  });

  it('posts only a deploy id for a manual snapshot', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ snapshotID: 'snap-a' }), { status: 201 }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(pocApi.snapshot('deploy-a')).resolves.toMatchObject({ snapshotID: 'snap-a' });
    expect(fetchMock).toHaveBeenCalledWith('/api/poc/snapshots', expect.objectContaining({
      method: 'POST',
      body: JSON.stringify({ deploy_id: 'deploy-a' }),
    }));
  });
});
