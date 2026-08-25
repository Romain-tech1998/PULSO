import { EventEmitter } from 'node:events';
import { describe, expect, it, vi } from 'vitest';

import { buildApp } from './app.js';
import {
  combineSinks,
  createLogSink,
  createWebhookSink,
  describeError,
  installProcessErrorReporting,
  type ReportedError
} from './error-reporting.js';
import { fakeEventRepository } from './test-support.js';

describe('describeError', () => {
  it('carries the message, the stack and the route it happened on', () => {
    const reported = describeError('request', new Error('boom'), {
      route: '/groups/:id/posts',
      method: 'POST',
      requestId: 'req-7'
    });
    expect(reported.kind).toBe('request');
    expect(reported.message).toBe('boom');
    expect(reported.stack).toContain('boom');
    expect(reported.route).toBe('/groups/:id/posts');
    expect(reported.requestId).toBe('req-7');
    expect(Date.parse(reported.at)).not.toBeNaN();
  });

  it('survives a thrown value that is not an Error', () => {
    // Real code throws strings, and rejected promises carry anything at
    // all. A reporter that only understands Error loses exactly the cases
    // nobody anticipated.
    expect(describeError('x', 'plain string').message).toBe('plain string');
    expect(describeError('x', { odd: true }).message).toBe(
      'Non-error value thrown'
    );
    expect(describeError('x', undefined).message).toBe(
      'Non-error value thrown'
    );
  });
});

describe('webhook sink', () => {
  it('posts the report as JSON', async () => {
    const post = vi.fn().mockResolvedValue(new Response('{}'));
    createWebhookSink(
      'https://hook.example/errors',
      post as never
    )(describeError('request', new Error('boom')));
    expect(post).toHaveBeenCalledOnce();
    const [url, init] = post.mock.calls[0]!;
    expect(url).toBe('https://hook.example/errors');
    expect(JSON.parse((init as RequestInit).body as string).message).toBe(
      'boom'
    );
  });

  it('never turns a reported error into a new one', async () => {
    // The sink is called from inside an error handler. If its own failure
    // escaped, a handled 500 would become an unhandled rejection - the
    // monitoring making the outage worse than the bug.
    const post = vi.fn().mockRejectedValue(new Error('monitoring is down'));
    expect(() =>
      createWebhookSink(
        'https://hook.example/errors',
        post as never
      )(describeError('request', new Error('boom')))
    ).not.toThrow();
    await new Promise((resolve) => setImmediate(resolve));
  });
});

describe('combineSinks', () => {
  it('tells every sink', () => {
    const seen: string[] = [];
    combineSinks([
      () => {
        seen.push('a');
      },
      () => {
        seen.push('b');
      }
    ])(describeError('request', new Error('boom')));
    expect(seen).toEqual(['a', 'b']);
  });

  it('does not let one broken sink silence the others', () => {
    const seen: string[] = [];
    combineSinks([
      () => {
        throw new Error('this sink is broken');
      },
      () => {
        seen.push('still told');
      }
    ])(describeError('request', new Error('boom')));
    expect(seen).toEqual(['still told']);
  });
});

describe('log sink', () => {
  it('writes one structured line that greps', () => {
    const lines: Array<[Record<string, unknown>, string]> = [];
    createLogSink((payload, message) => {
      lines.push([payload, message]);
    })(describeError('uncaughtException', new Error('boom')));
    expect(lines).toHaveLength(1);
    expect(lines[0]![1]).toBe('pulso.error.uncaughtException');
    expect((lines[0]![0]['pulsoError'] as ReportedError).message).toBe('boom');
  });
});

describe('process-level reporting', () => {
  it('catches a rejection nobody awaited and a throw outside a request', () => {
    const reported: ReportedError[] = [];
    const target = new EventEmitter();
    const detach = installProcessErrorReporting((error) => {
      reported.push(error);
    }, target);

    target.emit('unhandledRejection', new Error('nobody awaited me'));
    target.emit('uncaughtException', new Error('thrown in a timer'));

    expect(reported.map((error) => error.kind)).toEqual([
      'unhandledRejection',
      'uncaughtException'
    ]);
    expect(reported[0]!.message).toBe('nobody awaited me');

    detach();
    target.emit('unhandledRejection', new Error('after detach'));
    expect(reported).toHaveLength(2);
  });
});

describe('a real failure, end to end', () => {
  it('reports the 500 a request actually produced', async () => {
    const reported: ReportedError[] = [];
    const app = buildApp(
      fakeEventRepository({
        findInBounds: async () => {
          throw new Error('the database went away');
        }
      }),
      {
        errorSink: (error) => {
          reported.push(error);
        }
      }
    );

    const response = await app.inject({
      method: 'GET',
      url: '/events?west=-74&south=45&east=-73&north=46'
    });

    expect(response.statusCode).toBe(500);
    expect(reported).toHaveLength(1);
    expect(reported[0]!.kind).toBe('request');
    expect(reported[0]!.message).toBe('the database went away');
    expect(reported[0]!.route).toBe('/events');
    expect(reported[0]!.method).toBe('GET');
    // The id is what ties the alert back to the log line.
    expect(reported[0]!.requestId).toBeTruthy();
    await app.close();
  });

  it('does not report a request that was merely invalid', async () => {
    // A 400 is the caller being wrong, not Pulso failing. Alerting on it
    // would bury the failures that matter under ordinary bad input.
    const reported: ReportedError[] = [];
    const app = buildApp(fakeEventRepository(), {
      errorSink: (error) => {
        reported.push(error);
      }
    });
    const response = await app.inject({ method: 'GET', url: '/events' });
    expect(response.statusCode).toBe(400);
    expect(reported).toHaveLength(0);
    await app.close();
  });
});
