/**
 * The stored-schema version of the DIF registry record in D1
 * (`directory_store` key `dif-registry`). Written by the directory worker's
 * daily sync, read by the directory pages AND the mother's /methods badge
 * reader — ONE constant, so the two Workers can never disagree about what
 * shape is current. Bump here (and only here) when DifRegistry changes.
 */
export const DIF_REGISTRY_VERSION = 2;
