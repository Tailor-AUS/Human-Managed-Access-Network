/**
 * HMAN Authenticity - Proof of Human
 * 
 * "In a world of AI-generated content, HMAN proves what's REAL."
 * 
 * This module provides:
 * - Content signing with biometric verification
 * - HMAN VERIFIED badge generation
 * - Verification API for proving human authorship
 */

import * as crypto from 'crypto';

/**
 * A signed piece of content with HMAN verification
 */
export interface HmanSignature {
    /** Unique verification ID */
    id: string;

    /** Who created this content */
    creator: {
        /** Display name */
        name: string;
        /** HMAN identity hash (anonymized) */
        identityHash: string;
    };

    /** Hash of the content that was signed */
    contentHash: string;

    /** When it was signed */
    timestamp: string;

    /** Verification status */
    status: 'human-authored' | 'ai-assisted' | 'unknown';

    /** How the identity was verified */
    verificationMethod: 'faceid' | 'touchid' | 'pin' | 'signal';

    /** Digital signature */
    signature: string;
}

/**
 * Badge that can be embedded in content
 */
export interface HmanBadge {
    /** Verification URL */
    verifyUrl: string;

    /** Short verification ID */
    shortId: string;

    /** HTML embed code */
    embedHtml: string;

    /** Markdown embed */
    embedMarkdown: string;

    /** QR code data URL */
    qrCode?: string;
}

/**
 * HMAN Authenticity Service
 * 
 * Signs content and provides verification
 */
export class HmanAuthenticity {
    private privateKey: string;
    private publicKey: string;
    private identityHash: string;
    private displayName: string;

    constructor(config: {
        displayName: string;
        identityHash: string;
        privateKey?: string;
        publicKey?: string;
    }) {
        this.displayName = config.displayName;
        this.identityHash = config.identityHash;

        // Use provided keys or generate new ones
        if (config.privateKey && config.publicKey) {
            this.privateKey = config.privateKey;
            this.publicKey = config.publicKey;
        } else {
            const { privateKey, publicKey } = crypto.generateKeyPairSync('ed25519');
            this.privateKey = privateKey.export({ type: 'pkcs8', format: 'pem' }) as string;
            this.publicKey = publicKey.export({ type: 'spki', format: 'pem' }) as string;
        }
    }

    /**
     * Sign content as human-authored
     */
    async signContent(
        content: string | Buffer,
        options: {
            status?: 'human-authored' | 'ai-assisted';
            verificationMethod?: 'faceid' | 'touchid' | 'pin' | 'signal';
        } = {}
    ): Promise<HmanSignature> {
        const contentBuffer = typeof content === 'string' ? Buffer.from(content) : content;
        const contentHash = crypto
            .createHash('sha256')
            .update(contentBuffer)
            .digest('hex');

        // Generate unique ID
        const id = this.generateVerificationId();

        // Create timestamp
        const timestamp = new Date().toISOString();

        // Create the signature data
        const signatureData = {
            id,
            contentHash,
            timestamp,
            identityHash: this.identityHash,
            status: options.status || 'human-authored',
        };

        // Sign it
        const sign = crypto.createSign('ed25519');
        sign.update(JSON.stringify(signatureData));
        const signature = sign.sign(this.privateKey, 'base64');

        return {
            id,
            creator: {
                name: this.displayName,
                identityHash: this.identityHash,
            },
            contentHash,
            timestamp,
            status: options.status || 'human-authored',
            verificationMethod: options.verificationMethod || 'signal',
            signature,
        };
    }

    /**
     * Verify a signature is valid
     */
    verifySignature(
        signature: HmanSignature,
        publicKey: string
    ): boolean {
        try {
            const signatureData = {
                id: signature.id,
                contentHash: signature.contentHash,
                timestamp: signature.timestamp,
                identityHash: signature.creator.identityHash,
                status: signature.status,
            };

            const verify = crypto.createVerify('ed25519');
            verify.update(JSON.stringify(signatureData));
            return verify.verify(publicKey, signature.signature, 'base64');
        } catch {
            return false;
        }
    }

    /**
     * Generate embeddable badge for content
     */
    generateBadge(signature: HmanSignature): HmanBadge {
        const shortId = signature.id.slice(0, 8);
        const verifyUrl = `https://hman.io/v/${signature.id}`;

        const embedHtml = `
<div class="hman-verified" data-id="${signature.id}">
  <a href="${verifyUrl}" target="_blank" style="
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 8px 12px;
    background: linear-gradient(135deg, #10b981, #06b6d4);
    color: white;
    font-family: -apple-system, BlinkMacSystemFont, sans-serif;
    font-size: 12px;
    font-weight: 600;
    text-decoration: none;
    border-radius: 6px;
  ">
    ✓ HMAN VERIFIED
  </a>
</div>`.trim();

        const embedMarkdown = `[![HMAN VERIFIED](https://hman.io/badge/${signature.id}.svg)](${verifyUrl})`;

        return {
            verifyUrl,
            shortId,
            embedHtml,
            embedMarkdown,
        };
    }

    /**
     * Generate a short verification ID
     */
    private generateVerificationId(): string {
        const bytes = crypto.randomBytes(8);
        return bytes.toString('hex');
    }

    /**
     * Get public key for verification
     */
    getPublicKey(): string {
        return this.publicKey;
    }

    /**
     * Format signature as human-readable text
     */
    formatSignature(signature: HmanSignature): string {
        return `
┌──────────────────────────────────────────────────┐
│ ✓ HMAN VERIFIED                                  │
├──────────────────────────────────────────────────┤
│ Created by: ${signature.creator.name.padEnd(35)}│
│ Status: ${signature.status.padEnd(39)}│
│ Signed: ${new Date(signature.timestamp).toLocaleString().padEnd(39)}│
│ Verify: hman://v/${signature.id.padEnd(27)}│
└──────────────────────────────────────────────────┘
    `.trim();
    }
}

/**
 * Verification result from checking a signature
 */
export interface VerificationResult {
    valid: boolean;
    signature?: HmanSignature;
    error?: string;
    checkedAt: string;
}

/**
 * Registry for storing and looking up signatures
 * In production, this would be a distributed database
 */
export class SignatureRegistry {
    private signatures: Map<string, { signature: HmanSignature; publicKey: string }> = new Map();

    /**
     * Register a new signature
     */
    register(signature: HmanSignature, publicKey: string): void {
        this.signatures.set(signature.id, { signature, publicKey });
    }

    /**
     * Look up and verify a signature
     */
    verify(id: string): VerificationResult {
        const entry = this.signatures.get(id);

        if (!entry) {
            return {
                valid: false,
                error: 'Signature not found',
                checkedAt: new Date().toISOString(),
            };
        }

        const authenticity = new HmanAuthenticity({
            displayName: entry.signature.creator.name,
            identityHash: entry.signature.creator.identityHash,
        });

        const valid = authenticity.verifySignature(entry.signature, entry.publicKey);

        return {
            valid,
            signature: valid ? entry.signature : undefined,
            error: valid ? undefined : 'Invalid signature',
            checkedAt: new Date().toISOString(),
        };
    }

    /**
     * Get all signatures for a creator
     */
    getByCreator(identityHash: string): HmanSignature[] {
        return Array.from(this.signatures.values())
            .filter(entry => entry.signature.creator.identityHash === identityHash)
            .map(entry => entry.signature);
    }
}

// Example usage
export async function demonstrateAuthenticity(): Promise<void> {
    console.log('=== HMAN Authenticity Demo ===\n');

    // Create identity
    const identityHash = crypto.createHash('sha256')
        .update('john@example.com')
        .digest('hex')
        .slice(0, 16);

    const auth = new HmanAuthenticity({
        displayName: 'John Smith',
        identityHash,
    });

    // Sign some content
    const article = `
# My Thoughts on AI
This is a genuine article written by a human.
Not generated by AI.
  `.trim();

    console.log('Signing article...\n');
    const signature = await auth.signContent(article, {
        status: 'human-authored',
        verificationMethod: 'faceid',
    });

    // Display the verification badge
    console.log(auth.formatSignature(signature));
    console.log();

    // Generate embeddable badge
    const badge = auth.generateBadge(signature);
    console.log('Verification URL:', badge.verifyUrl);
    console.log('Markdown embed:', badge.embedMarkdown);
    console.log();

    // Register and verify
    const registry = new SignatureRegistry();
    registry.register(signature, auth.getPublicKey());

    const result = registry.verify(signature.id);
    console.log('Verification result:', result.valid ? '✅ VALID' : '❌ INVALID');
}

// Run demo if executed directly
if (require.main === module) {
    demonstrateAuthenticity().catch(console.error);
}
