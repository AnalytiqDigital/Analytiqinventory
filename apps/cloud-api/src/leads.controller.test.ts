import { describe, expect, it } from 'vitest';
import { ApiError } from './common/api-error';
import { LeadsController } from './leads.controller';
import { MemoryLeadStore } from './leads/lead.store';

function controller(): { hook: LeadsController; store: MemoryLeadStore } {
  const store = new MemoryLeadStore();
  return { hook: new LeadsController(store), store };
}

const demo = {
  kind: 'demo',
  name: 'Ada Obi',
  business: 'Ada Stores',
  businessType: 'Provision store',
  phone: '0813 971 1767',
  email: 'ada@example.com',
  tills: '2 tills',
  branches: '1 branch',
};

describe('leads controller', () => {
  it('stores a demo request server-side', async () => {
    const { hook, store } = controller();

    const result = await hook.create(demo);

    expect(result).toMatchObject({ ok: true });
    expect(result.id).toMatch(/^lead_[0-9a-f]{16}$/);
    const leads = await store.list();
    expect(leads).toHaveLength(1);
    expect(leads[0]).toMatchObject({
      ...demo,
      kind: 'demo',
      createdAt: expect.any(String),
    });
  });

  it('accepts a quote request without an email', async () => {
    const { hook, store } = controller();

    await hook.create({
      kind: 'quote',
      name: 'Musa Bello',
      business: 'Bello Mart',
      phone: '08124314217',
      locations: '3 locations',
      notes: 'Need stock transfers',
      email: '',
    });

    const [lead] = await store.list();
    expect(lead).toMatchObject({ kind: 'quote', locations: '3 locations', email: '' });
  });

  it('rejects requests without a name or dialable phone', async () => {
    const { hook } = controller();

    const noName = hook.create({ ...demo, name: ' ' });
    await expect(noName).rejects.toBeInstanceOf(ApiError);
    await expect(noName).rejects.toMatchObject({ message: /name/i });

    const badPhone = hook.create({ ...demo, phone: '123' });
    await expect(badPhone).rejects.toMatchObject({ message: /phone/i });
  });
});
