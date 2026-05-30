/**
 * The organisation record — the registered legal person itself.
 */

import type { Id, ISODate } from './common.js';
import type { LegalForm, OrgStatus } from './legal-form.js';

export interface Organisation {
  id: Id;
  legal_form: LegalForm;
  /** Full registered name, e.g. "Acme Robotics Pty Ltd". */
  legal_name: string;
  /** Registered business/trading names. */
  trading_names?: string[];
  /** Jurisdiction of registration, e.g. "AU", "AU-VIC", "US-DE". */
  jurisdiction?: string;
  /** Registered company/association number (ACN, EIN, …). */
  registered_number?: string;
  registered_office?: string;
  /** Key id resolving the organisation's own {@link Signer}. */
  signing_key_id: string;
  /** Organisation public key (base64url raw). */
  public_key: string;
  status: OrgStatus;
  /** Id + version of the constitution currently in force. */
  constitution_id?: Id;
  constitution_version?: number;
  founded_at: ISODate;
  updated_at: ISODate;
  metadata?: Record<string, string>;
}
