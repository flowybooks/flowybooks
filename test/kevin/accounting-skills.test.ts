import { describe, expect, it } from 'vitest';

import { KEVIN_FLOWYBOOKS_SKILLS } from '@/lib/kevin/accounting-skills';

describe('Kevin Flowybooks product skill', () => {
  it('grounds Kevin in the local-first upload-based product model', () => {
    const guidance = JSON.stringify(KEVIN_FLOWYBOOKS_SKILLS);

    expect(guidance).toContain('local-first');
    expect(guidance).toContain('no bank feeds');
    expect(guidance).toContain('PDF/CSV uploads');
    expect(guidance).toContain('PGlite');
    expect(guidance).toContain('hosted OpenAI');
  });
});
