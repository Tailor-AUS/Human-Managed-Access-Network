/** UUID / opaque identifier. */
export type Id = string;
/** ISO-8601 timestamp string. */
export type ISODate = string;

/** A monetary amount in a given ISO-4217 currency. */
export interface Money {
  amount: number;
  currency: string;
}
