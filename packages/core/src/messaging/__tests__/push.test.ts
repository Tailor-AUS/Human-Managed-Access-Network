/**
 * APNs push channel tests (issue #17).
 *
 * Covers the wire contract between `dispatchToAPNs` and the bridge's
 * `POST /api/push/send` — the receptivity gate depends on this
 * boolean-result interface.
 */

import { describe, it, expect, vi } from 'vitest';
import { dispatchToAPNs, type DispatchableIntention } from '../push.js';

const intention: DispatchableIntention = {
    id: 'abc-123',
    summary: 'Calendar wants tomorrow at 3pm',
    expiresAt: '2026-04-27T03:00:00+10:00',
};

describe('dispatchToAPNs', () => {
    it('POSTs to the bridge with snake_case body + bearer auth', async () => {
        const fetchMock = vi.fn().mockResolvedValue({
            ok: true,
            status: 200,
            json: async () => ({ sent: true, apns_id: 'srv-uuid-1' }),
        } as unknown as Response);

        const result = await dispatchToAPNs(intention, 'member', {
            bridgeUrl: 'http://127.0.0.1:8765',
            bearerToken: 'token-xyz',
            fetchImpl: fetchMock as unknown as typeof fetch,
        });

        expect(result).toEqual({ sent: true, apnsId: 'srv-uuid-1' });
        expect(fetchMock).toHaveBeenCalledOnce();
        const [url, init] = fetchMock.mock.calls[0]!;
        expect(url).toBe('http://127.0.0.1:8765/api/push/send');
        const reqInit = init as RequestInit & { body: string; headers: Record<string, string> };
        expect(reqInit.method).toBe('POST');
        expect(reqInit.headers['Authorization']).toBe('Bearer token-xyz');
        expect(reqInit.headers['Content-Type']).toBe('application/json');
        const body = JSON.parse(reqInit.body);
        expect(body).toEqual({
            member_id: 'member',
            intention_id: 'abc-123',
            summary: 'Calendar wants tomorrow at 3pm',
            expires_at: '2026-04-27T03:00:00+10:00',
        });
    });

    it('returns sent=false with reason when bridge replies non-2xx', async () => {
        const fetchMock = vi.fn().mockResolvedValue({
            ok: false,
            status: 502,
            json: async () => ({}),
        } as unknown as Response);

        const result = await dispatchToAPNs(intention, 'member', {
            bearerToken: 'token-xyz',
            fetchImpl: fetchMock as unknown as typeof fetch,
        });

        expect(result.sent).toBe(false);
        expect(result.reason).toBe('bridge_status_502');
    });

    it('returns sent=false on network error (no throw)', async () => {
        const fetchMock = vi.fn().mockRejectedValue(new Error('econnrefused'));

        const result = await dispatchToAPNs(intention, 'member', {
            bearerToken: 'token-xyz',
            fetchImpl: fetchMock as unknown as typeof fetch,
        });

        expect(result.sent).toBe(false);
        expect(result.reason).toBe('network_error');
    });

    it('forwards the bridge reason on soft failures (no_token_registered etc)', async () => {
        const fetchMock = vi.fn().mockResolvedValue({
            ok: true,
            status: 200,
            json: async () => ({ sent: false, reason: 'no_token_registered' }),
        } as unknown as Response);

        const result = await dispatchToAPNs(intention, 'member', {
            bearerToken: 'token-xyz',
            fetchImpl: fetchMock as unknown as typeof fetch,
        });

        expect(result.sent).toBe(false);
        expect(result.reason).toBe('no_token_registered');
    });

    it('strips trailing slashes from bridgeUrl', async () => {
        const fetchMock = vi.fn().mockResolvedValue({
            ok: true,
            status: 200,
            json: async () => ({ sent: true, apns_id: 'x' }),
        } as unknown as Response);

        await dispatchToAPNs(intention, 'member', {
            bridgeUrl: 'https://bridge.example.com/',
            bearerToken: 'token-xyz',
            fetchImpl: fetchMock as unknown as typeof fetch,
        });

        const [url] = fetchMock.mock.calls[0]!;
        expect(url).toBe('https://bridge.example.com/api/push/send');
    });
});
