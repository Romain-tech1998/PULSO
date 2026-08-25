/**
 * Error monitoring, required before the first invitation by DEC-0026 §4.
 *
 * `DEPLOY.md` already stated the consequence: "In production you are blind
 * until you add some." Today the API logs a 500 to stdout and nothing else
 * happens — nobody is told, and an unhandled rejection is not caught at all,
 * so the process can die without leaving a line saying why.
 *
 * ## No vendor is chosen here
 *
 * Picking Sentry, or anything else, is a product decision with a cost and
 * an account attached, and it is not one this module should make on the
 * owner's behalf. So it follows the seam the codebase already uses for
 * `imageModerationProvider`, `lookupVenues` and `WalletPassProvider`: the
 * capability is injected, the shape is fixed here, and the deployment
 * decides what receives it.
 *
 * A sink is any function that takes a `ReportedError`. The webhook sink
 * below covers Sentry, Betterstack, Discord, Slack and anything else that
 * accepts a JSON POST, with no SDK and no lock-in.
 */

export interface ReportedError {
  /** Where it happened: 'request', 'unhandledRejection', 'uncaughtException'. */
  kind: string;
  message: string;
  stack?: string | undefined;
  /** Route pattern, not the concrete path, so alerts group sensibly. */
  route?: string | undefined;
  method?: string | undefined;
  /** Fastify's per-request id, to tie an alert to a log line. */
  requestId?: string | undefined;
  at: string;
}

export type ErrorSink = (error: ReportedError) => void | Promise<void>;

export function describeError(
  kind: string,
  error: unknown,
  context: {
    route?: string | undefined;
    method?: string | undefined;
    requestId?: string | undefined;
  } = {}
): ReportedError {
  const base: ReportedError = {
    kind,
    message:
      error instanceof Error
        ? error.message
        : typeof error === 'string'
          ? error
          : 'Non-error value thrown',
    at: new Date().toISOString()
  };
  if (error instanceof Error && error.stack) base.stack = error.stack;
  if (context.route !== undefined) base.route = context.route;
  if (context.method !== undefined) base.method = context.method;
  if (context.requestId !== undefined) base.requestId = context.requestId;
  return base;
}

/**
 * One line a person can read at a glance, before the structured fields.
 */
export function summarise(error: ReportedError): string {
  const where = error.route
    ? ` ${error.method ?? ''} ${error.route}`.trimEnd()
    : '';
  const id = error.requestId ? ` (${error.requestId})` : '';
  return `Pulso ${error.kind}${where}: ${error.message}${id}`;
}

/**
 * Posts the report and forgets about it.
 *
 * The body carries the structured fields *and* the one-line summary under
 * both of the two keys the common receivers require: Discord refuses any
 * payload with neither `content` nor `embeds` ("cannot send an empty
 * message"), and Slack reads `text`. Each ignores the other's key, and a
 * generic receiver gets the structured fields regardless.
 *
 * This matters more than it looks. The sink swallows its own failures by
 * design, so a body the receiver rejects produces exactly the silence the
 * whole variable exists to prevent - configured, accepted at boot,
 * reporting into nothing.
 *
 * Deliberately swallows its own failures: a monitoring sink that can turn a
 * handled 500 into an unhandled rejection has made the outage worse than
 * the bug it was reporting, and a request must never wait on it.
 */
export function createWebhookSink(
  url: string,
  post: typeof fetch = fetch
): ErrorSink {
  return (error) => {
    const summary = summarise(error);
    void post(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ content: summary, text: summary, ...error })
    }).catch(() => {});
  };
}

/**
 * The floor: a single structured line per error, in a shape that greps.
 * Not an alert, and it does not pretend to be one — but it is the
 * difference between an error being findable and being gone.
 */
export function createLogSink(
  log: (payload: Record<string, unknown>, message: string) => void
): ErrorSink {
  return (error) => log({ pulsoError: error }, `pulso.error.${error.kind}`);
}

/**
 * Fans a report out to every sink, and never lets one failing sink stop
 * another from being told.
 */
export function combineSinks(sinks: readonly ErrorSink[]): ErrorSink {
  return (error) => {
    for (const sink of sinks) {
      try {
        void sink(error);
      } catch {
        // A sink that throws is a sink that is broken, not a reason to
        // lose the report that the other sinks could still carry.
      }
    }
  };
}

/**
 * Catches what a request-scoped handler structurally cannot: a promise
 * rejected with nobody awaiting it, and a throw outside any request.
 *
 * `uncaughtException` deliberately does not exit. Fastify keeps serving
 * every other request, and a process that kills itself on one bad code
 * path takes the healthy ones with it. What matters is that it is reported
 * rather than silent.
 */
export function installProcessErrorReporting(
  sink: ErrorSink,
  target: NodeJS.EventEmitter = process
): () => void {
  const onRejection = (reason: unknown) =>
    sink(describeError('unhandledRejection', reason));
  const onException = (error: unknown) =>
    sink(describeError('uncaughtException', error));
  target.on('unhandledRejection', onRejection);
  target.on('uncaughtException', onException);
  return () => {
    target.off('unhandledRejection', onRejection);
    target.off('uncaughtException', onException);
  };
}
