import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import type { LeadInput } from '@analytiq/validation';

export const LEAD_STORE = 'LEAD_STORE';

export interface Lead extends LeadInput {
  id: string;
  createdAt: string;
}

export interface LeadStore {
  add(lead: Lead): Promise<void>;
  list(): Promise<Lead[]>;
}

export class MemoryLeadStore implements LeadStore {
  private readonly leads: Lead[] = [];

  async add(lead: Lead): Promise<void> {
    this.leads.push({ ...lead });
  }

  async list(): Promise<Lead[]> {
    return this.leads.map((lead) => ({ ...lead }));
  }
}

interface Snapshot {
  version: 1;
  leads: Lead[];
}

/** Single-writer JSON store, matching the order store's deployment model. */
export class FileLeadStore implements LeadStore {
  private loaded = false;
  private readonly leads: Lead[] = [];
  private queue: Promise<void> = Promise.resolve();

  constructor(private readonly filePath: string) {}

  private load(): void {
    if (this.loaded) return;
    this.loaded = true;
    try {
      const snapshot = JSON.parse(readFileSync(this.filePath, 'utf8')) as Snapshot;
      this.leads.push(...(snapshot.leads ?? []));
    } catch {
      // No file yet; the first lead creates it.
    }
  }

  async add(lead: Lead): Promise<void> {
    this.load();
    this.leads.push({ ...lead });
    const write = this.queue.then(() => this.flush());
    this.queue = write.catch(() => undefined);
    return write;
  }

  async list(): Promise<Lead[]> {
    this.load();
    return this.leads.map((lead) => ({ ...lead }));
  }

  private flush(): void {
    mkdirSync(dirname(this.filePath), { recursive: true });
    const snapshot: Snapshot = { version: 1, leads: this.leads };
    const temporary = `${this.filePath}.tmp`;
    writeFileSync(temporary, JSON.stringify(snapshot, null, 2), 'utf8');
    renameSync(temporary, this.filePath);
  }
}
