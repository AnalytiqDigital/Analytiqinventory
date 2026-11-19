import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import type { LicensePlanId } from '@analytiq/validation';

export type OrderStatus = 'pending' | 'paid' | 'failed';

export interface Order {
  /** Unguessable id shared with Paystack and the success page. */
  reference: string;
  planId: LicensePlanId;
  business: string;
  name: string;
  email: string;
  phone: string;
  amountKobo: number;
  status: OrderStatus;
  /** Set once paid; the customer copies it into Settings → License. */
  licenseKey: string | null;
  createdAt: string;
  paidAt: string | null;
}

export interface OrderStore {
  get(reference: string): Promise<Order | undefined>;
  put(order: Order): Promise<void>;
}

export class MemoryOrderStore implements OrderStore {
  private readonly orders = new Map<string, Order>();

  async get(reference: string): Promise<Order | undefined> {
    const order = this.orders.get(reference);
    return order ? { ...order } : undefined;
  }

  async put(order: Order): Promise<void> {
    this.orders.set(order.reference, { ...order });
  }
}

interface Snapshot {
  version: 1;
  orders: Record<string, Order>;
}

/**
 * Single-writer JSON store for the first commercial deployment: atomic
 * replace, one file, no database to provision. Run the API as a single
 * instance — writes from two processes would overwrite each other. The
 * OrderStore seam keeps a Postgres implementation a drop-in swap later.
 */
export class FileOrderStore implements OrderStore {
  private loaded = false;
  private readonly orders = new Map<string, Order>();
  private queue: Promise<void> = Promise.resolve();

  constructor(private readonly filePath: string) {}

  private load(): void {
    if (this.loaded) return;
    this.loaded = true;
    let text: string;
    try {
      text = readFileSync(this.filePath, 'utf8');
    } catch {
      return; // No file yet: first order will create it.
    }
    const snapshot = JSON.parse(text) as Snapshot;
    for (const [reference, order] of Object.entries(snapshot.orders ?? {})) {
      this.orders.set(reference, order);
    }
  }

  async get(reference: string): Promise<Order | undefined> {
    this.load();
    const order = this.orders.get(reference);
    return order ? { ...order } : undefined;
  }

  async put(order: Order): Promise<void> {
    this.load();
    this.orders.set(order.reference, { ...order });
    const write = this.queue.then(() => this.flush());
    // Keep the chain alive even if a write fails; callers see the rejection.
    this.queue = write.catch(() => undefined);
    return write;
  }

  private flush(): void {
    mkdirSync(dirname(this.filePath), { recursive: true });
    const snapshot: Snapshot = {
      version: 1,
      orders: Object.fromEntries(this.orders),
    };
    const temporary = `${this.filePath}.tmp`;
    writeFileSync(temporary, JSON.stringify(snapshot, null, 2), 'utf8');
    renameSync(temporary, this.filePath);
  }
}
