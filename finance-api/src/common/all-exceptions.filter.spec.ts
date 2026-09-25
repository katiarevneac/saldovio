import { describe, expect, it, vi } from 'vitest';
import { HttpException, HttpStatus } from '@nestjs/common';
import { AllExceptionsFilter } from './all-exceptions.filter.js';

function mockHost(getResponse: () => unknown) {
  return {
    switchToHttp: () => ({
      getResponse: () => getResponse(),
      getRequest: () => ({ url: '/test' }),
    }),
  } as never;
}

describe('AllExceptionsFilter', () => {
  it('passes through an existing HttpException with its own status and message', () => {
    const filter = new AllExceptionsFilter();
    const json = vi.fn();
    const status = vi.fn().mockReturnValue({ json });
    filter.catch(new HttpException('Not found', HttpStatus.NOT_FOUND), mockHost(() => ({ status })));
    expect(status).toHaveBeenCalledWith(404);
    // HttpException.getResponse() returns exactly what was passed to the
    // constructor — for a plain string it's the string itself, not an
    // object (confirmed by reading @nestjs/common's HttpException source
    // directly: getResponse() just returns `this.response` verbatim).
    // The filter's job is to pass that through unchanged.
    expect(json).toHaveBeenCalledWith('Not found');
  });

  it('converts an unhandled Error into a generic 500 with no stack trace in the body', () => {
    const filter = new AllExceptionsFilter();
    const json = vi.fn();
    const status = vi.fn().mockReturnValue({ json });
    filter.catch(new Error('some internal detail, e.g. a SQL fragment'), mockHost(() => ({ status })));
    expect(status).toHaveBeenCalledWith(500);
    const body = json.mock.calls[0][0];
    expect(body.message).toBe('Internal server error');
    expect(JSON.stringify(body)).not.toContain('some internal detail');
  });
});
