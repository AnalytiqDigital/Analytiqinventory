import { z } from 'zod';

// Batch 1 placeholder. Full transactional outbox + idempotency arrives in Batch 8.
export const syncEventSchema = z.object({
  eventId: z.string().uuid(),
  idempotencyKey: z.string().uuid(),
  occurredAt: z.string().datetime(),
  businessId: z.string().uuid(),
  kind: z.string().min(1),
});

export type SyncEvent = z.infer<typeof syncEventSchema>;
