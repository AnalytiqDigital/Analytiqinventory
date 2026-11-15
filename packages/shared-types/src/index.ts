export type UUID = string;

export interface TenantRef {
  businessId: UUID;
  locationId?: UUID;
}

export interface SyncEnvelope {
  eventId: UUID;
  idempotencyKey: UUID;
  occurredAt: string;
  businessId: UUID;
}
