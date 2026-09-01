export { getResolver, resolutionResult, dereferenceFragment, type OydResolverOptions, } from "./resolver.js";
export { read } from "./read.js";
export { w3c, versionIds, versionMetadata, documentId, expandVerificationMethods, ED25519_SECURITY_SUITE, type W3cDocument, type W3cResult, type W3cComposeError, } from "./w3c.js";
export { canonical, getDigest, getEncoding, getDelegatedPubKeysFromFullDidDocument, getLocation, hashDefault, isPubKeyIdentifier, multiDecode, multiEncode, multiHash, percentEncode, retrieveDocument, retrieveDocumentRaw, retrieveLog, stripLocation, verify, DEFAULT_LOCATION, DidError, LOG_HASH_OPTIONS, MULTICODEC_ED25519_PUB, MULTICODEC_SHA2_256, type DidErrorCode, type DidInfo, type DocRecord, type LogEntry, type OpCode, type OydOptions, type Tuple, } from "./basic.js";
export { dagDid, dag2array, dag2arrayTerminate, dagUpdate, matchLogDid, Dag, Op, REVOKED_ERROR_CODE, type Vertex, } from "./log.js";
export { checkRepositoryUrl, MAX_LOG_ENTRIES, MAX_PREVIOUS_PER_ENTRY, MAX_ROTATION_DEPTH, type RepositoryPolicy, } from "./security.js";
//# sourceMappingURL=index.d.ts.map