/**
 * APNs push channel (issue #17).
 *
 * Typed wrapper around the bridge's `POST /api/push/send`. Called by
 * the receptivity gate (issue #4) when it resolves an intention's
 * surface channel to `apns` — alternative to Signal for non-Signal
 * users and devices that want OS-native consent prompts.
 *
 * Privacy contract (also enforced by `api/push.py`):
 * - Outgoing payload carries `intentionId` + a short `summary` only.
 * - `summary` MUST be lock-screen safe — strip transcripts, contact
 *   names that aren't already on-device, vault contents.
 * - `expiresAt` lets the iOS layer decide whether the prompt is
 *   still actionable when the user finally taps; expired pushes
 *   route to a "no-op, this expired" state rather than firing an
 *   approval after the fact.
 *
 * The full intention payload never leaves the bridge — the iOS app
 * fetches details from a separate authenticated endpoint after the
 * user opens the notification.
 */

/** What the gate hands us. Kept minimal so the receptivity gate
 *  doesn't need to know about APNs internals. */
export interface DispatchableIntention {
    /** Stable id used by the gate, the iOS app, and audit logs. */
    id: string;
    /** Lock-screen-safe summary. Must already be PII-stripped. */
    summary: string;
    /** ISO-8601 timestamp at which the prompt becomes irrelevant. */
    expiresAt: string;
}

/** Result of a single dispatch attempt. The gate reads `sent` to
 *  decide whether to fall through to another channel (e.g. Signal). */
export interface PushDispatchResult {
    sent: boolean;
    /** APNs server-assigned uuid when the push was accepted. */
    apnsId?: string;
    /** Machine-readable failure reason. Possible values:
     *  - `no_token_registered`
     *  - `apns_auth_key_missing`
     *  - `apns_creds_incomplete`
     *  - `aioapns_not_installed`
     *  - `apns_status_<code>` (e.g. 410 BadDeviceToken — caller
     *    should clear the stored token and re-register on next
     *    app launch)
     *  - `network_error`
     */
    reason?: string;
}

export interface PushDispatcherConfig {
    /** Bridge base URL. Default: `http://127.0.0.1:8765`. */
    bridgeUrl?: string;
    /** Bearer token for `/api/*`. */
    bearerToken: string;
    /** Optional `fetch` implementation (tests inject a stub). */
    fetchImpl?: typeof fetch;
}

/**
 * Dispatch an intention to the registered iPhone via APNs.
 *
 * Returns `{ sent: true, apnsId }` on success, or `{ sent: false,
 * reason }` on any failure. Never throws on transport errors — the
 * receptivity gate's fall-through logic depends on a clean boolean.
 */
export async function dispatchToAPNs(
    intention: DispatchableIntention,
    memberId: string,
    config: PushDispatcherConfig,
): Promise<PushDispatchResult> {
    const baseUrl = config.bridgeUrl ?? 'http://127.0.0.1:8765';
    const url = `${baseUrl.replace(/\/$/, '')}/api/push/send`;
    const fetchFn = config.fetchImpl ?? fetch;

    const body = {
        member_id: memberId,
        intention_id: intention.id,
        summary: intention.summary,
        expires_at: intention.expiresAt,
    };

    let response: Response;
    try {
        response = await fetchFn(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${config.bearerToken}`,
            },
            body: JSON.stringify(body),
        });
    } catch (err) {
        return { sent: false, reason: 'network_error' };
    }

    if (!response.ok) {
        return { sent: false, reason: `bridge_status_${response.status}` };
    }

    try {
        const json = (await response.json()) as {
            sent: boolean;
            apns_id?: string;
            reason?: string;
        };
        return {
            sent: !!json.sent,
            apnsId: json.apns_id,
            reason: json.reason,
        };
    } catch {
        return { sent: false, reason: 'decode_error' };
    }
}
