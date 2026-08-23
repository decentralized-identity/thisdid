/**
 * did:hedera resolver for the DIF `did-resolver` interface.
 *
 * A clean-room driver over Hedera's PUBLIC mirror-node REST API — no
 * `@hashgraph/sdk`, no keys, no fees. A did:hedera identifier names an
 * Ed25519 root key and an HCS topic (`did:hedera:<network>:z<base58-key>_
 * <shard.realm.num>`); the topic's messages are the DID's event log.
 *
 * HCS topics are PUBLICLY WRITABLE, so trust comes from signatures, not
 * from the topic: every message envelope carries an Ed25519 signature over
 * the serialized `message` object, and this driver verifies each one
 * against the DID root key (validated live: all captured envelopes verify
 * exactly this way) — unsigned or mis-signed messages are ignored, exactly
 * as the reference SDK ignores them. Events then fold in consensus order:
 * DIDOwner (create), VerificationMethod / VerificationRelationship /
 * Service upserts, `revoke` removals, and `delete` (deactivation).
 *
 * The composed document matches the reference driver output: the root key
 * renders as `#did-root-key` (Ed25519VerificationKey2020, multibase
 * `z6Mk…` = base58btc of 0xed01 + key) holding `authentication` and
 * `assertionMethod`; added methods/services render verbatim after shape
 * validation (see isValidEventEntry).
 *
 * Event history is BOUNDED AND FAIL-CLOSED: a topic with more messages than
 * `maxMessages` refuses to resolve (`resourceLimitExceeded`) rather than
 * composing from partial history — silent truncation would drop later
 * rotations/revocations/deletions, and on a publicly writable topic an
 * attacker could flood early positions to push signed events past any cap.
 */
import type { ResolverRegistry } from "did-resolver";
export interface HederaResolverOptions {
    /** Network → mirror-node base URL. Defaults to Hedera's public mirrors. */
    mirrorUrls?: Record<string, string>;
    /** Per-request wall-clock bound. Default 6000 ms. */
    timeoutMs?: number;
    /** Upper bound on topic messages folded per DID. Default 1000. */
    maxMessages?: number;
}
export declare function getResolver(options?: HederaResolverOptions): ResolverRegistry;
//# sourceMappingURL=resolver.d.ts.map