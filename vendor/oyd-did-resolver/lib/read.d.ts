/**
 * Transliteration of `Oydid.read` (ruby-gem/lib/oydid.rb:65) from the OYDID
 * reference, pinned at OwnYourData/oydid@48a62c9, against spec v0.6 §3.2
 * (#read). Same walk: retrieve the DID document, retrieve and DAG-order the
 * provenance log, then dag_update to the current version.
 */
import { type DidInfo, type OydOptions, type Tuple } from "./basic.js";
/** ⇔ read (oydid.rb:65) · spec §3.2 #read */
export declare function read(did: string, options: OydOptions): Promise<Tuple<DidInfo>>;
//# sourceMappingURL=read.d.ts.map