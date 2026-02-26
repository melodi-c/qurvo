import { describe, it, expect, vi } from 'vitest';
import { validateMessages } from '../../processor/pipeline/validate.step.js';
import type { RawMessage, PipelineContext } from '../../processor/pipeline/types.js';

function makeCtx(): PipelineContext {
  return {
    logger: { warn: vi.fn() } as unknown as PipelineContext['logger'],
    onWarning: vi.fn(),
  } as unknown as PipelineContext;
}

function makeMsg(id: string, fields: Record<string, string>): RawMessage {
  return { id, fields };
}

function validFields(overrides: Partial<Record<string, string>> = {}): Record<string, string> {
  return { project_id: 'proj-1', event_name: 'click', distinct_id: 'user-123', ...overrides };
}

describe('validateMessages', () => {
  describe('valid events', () => {
    it('passes a well-formed event', () => {
      const ctx = makeCtx();
      const result = validateMessages([makeMsg('1', validFields())], ctx);
      expect(result.valid).toHaveLength(1);
      expect(result.invalidIds).toHaveLength(0);
    });

    it('passes multiple valid events', () => {
      const ctx = makeCtx();
      const msgs = [
        makeMsg('1', validFields({ distinct_id: 'user-1' })),
        makeMsg('2', validFields({ distinct_id: 'user-2' })),
      ];
      const result = validateMessages(msgs, ctx);
      expect(result.valid).toHaveLength(2);
      expect(result.invalidIds).toHaveLength(0);
    });
  });

  describe('missing required fields', () => {
    it('rejects event missing project_id', () => {
      const ctx = makeCtx();
      const result = validateMessages([makeMsg('1', { event_name: 'click', distinct_id: 'user-1' })], ctx);
      expect(result.valid).toHaveLength(0);
      expect(result.invalidIds).toEqual(['1']);
    });

    it('rejects event missing event_name', () => {
      const ctx = makeCtx();
      const result = validateMessages([makeMsg('1', { project_id: 'proj-1', distinct_id: 'user-1' })], ctx);
      expect(result.valid).toHaveLength(0);
      expect(result.invalidIds).toEqual(['1']);
    });

    it('rejects event missing distinct_id', () => {
      const ctx = makeCtx();
      const result = validateMessages([makeMsg('1', { project_id: 'proj-1', event_name: 'click' })], ctx);
      expect(result.valid).toHaveLength(0);
      expect(result.invalidIds).toEqual(['1']);
    });
  });

  describe('illegal distinct_ids', () => {
    const illegalIds = [
      'anonymous',
      'null',
      'undefined',
      'none',
      'nil',
      '[object object]',
      'nan',
      'true',
      'false',
      '0',
      'guest',
    ];

    for (const id of illegalIds) {
      it(`rejects distinct_id="${id}"`, () => {
        const ctx = makeCtx();
        const result = validateMessages([makeMsg('1', validFields({ distinct_id: id }))], ctx);
        expect(result.valid).toHaveLength(0);
        expect(result.invalidIds).toEqual(['1']);
      });

      it(`rejects distinct_id="${id.toUpperCase()}" (case-insensitive)`, () => {
        const ctx = makeCtx();
        const result = validateMessages([makeMsg('1', validFields({ distinct_id: id.toUpperCase() }))], ctx);
        expect(result.valid).toHaveLength(0);
        expect(result.invalidIds).toEqual(['1']);
      });

      it(`rejects distinct_id="  ${id}  " (trimmed)`, () => {
        const ctx = makeCtx();
        const result = validateMessages([makeMsg('1', validFields({ distinct_id: `  ${id}  ` }))], ctx);
        expect(result.valid).toHaveLength(0);
        expect(result.invalidIds).toEqual(['1']);
      });
    }

    it('accepts a legitimate distinct_id that is not on the blocklist', () => {
      const ctx = makeCtx();
      const result = validateMessages([makeMsg('1', validFields({ distinct_id: 'real-user-42' }))], ctx);
      expect(result.valid).toHaveLength(1);
      expect(result.invalidIds).toHaveLength(0);
    });
  });

  describe('mixed batch', () => {
    it('separates valid from invalid in a mixed batch', () => {
      const ctx = makeCtx();
      const msgs = [
        makeMsg('1', validFields({ distinct_id: 'user-1' })),
        makeMsg('2', validFields({ distinct_id: 'guest' })),
        makeMsg('3', validFields({ distinct_id: 'user-3' })),
        makeMsg('4', { project_id: 'proj-1', event_name: 'click' }), // missing distinct_id
      ];
      const result = validateMessages(msgs, ctx);
      expect(result.valid).toHaveLength(2);
      expect(result.valid.map((m) => m.id)).toEqual(['1', '3']);
      expect(result.invalidIds).toEqual(['2', '4']);
    });
  });

  describe('onWarning callbacks', () => {
    it('calls onWarning for missing fields when project_id is present', () => {
      const ctx = makeCtx();
      validateMessages([makeMsg('1', { project_id: 'proj-1', event_name: 'click' })], ctx);
      expect(ctx.onWarning).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'invalid_event', project_id: 'proj-1' }),
      );
    });

    it('calls onWarning for illegal distinct_id', () => {
      const ctx = makeCtx();
      validateMessages([makeMsg('1', validFields({ distinct_id: 'guest' }))], ctx);
      expect(ctx.onWarning).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'illegal_distinct_id', project_id: 'proj-1' }),
      );
    });

    it('does NOT call onWarning for missing fields when project_id is absent', () => {
      const ctx = makeCtx();
      validateMessages([makeMsg('1', { event_name: 'click', distinct_id: 'user-1' })], ctx);
      expect(ctx.onWarning).not.toHaveBeenCalled();
    });
  });
});
