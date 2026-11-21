import { randomBytes } from 'node:crypto';
import { Body, Controller, Inject, Post } from '@nestjs/common';
import { leadSchema } from '@analytiq/validation';
import { parseInput } from './common/api-error';
import { LEAD_STORE, type Lead, type LeadStore } from './leads/lead.store';

@Controller('api')
export class LeadsController {
  constructor(@Inject(LEAD_STORE) private readonly leads: LeadStore) {}

  /** Demo and cloud-quote forms keep their WhatsApp hand-off and also land here. */
  @Post('leads')
  async create(@Body() body: unknown): Promise<Record<string, unknown>> {
    const input = parseInput(leadSchema, body);
    const lead: Lead = {
      id: `lead_${randomBytes(8).toString('hex')}`,
      ...input,
      createdAt: new Date().toISOString(),
    };
    await this.leads.add(lead);
    return { ok: true, id: lead.id };
  }
}
