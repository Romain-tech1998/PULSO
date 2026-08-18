import {
  claimTicketsRequestSchema,
  createTicketTypeRequestSchema,
  eventAdmissionsResponseSchema,
  myTicketsResponseSchema,
  scanTicketRequestSchema,
  scanTicketResponseSchema,
  ticketTypesResponseSchema
} from '@pulso/contracts';
import type { TicketType } from '@pulso/contracts';
import type {
  AuthRepository,
  HeldTicket,
  TicketingRepository
} from '@pulso/database';
import {
  NotTicketOrganizerError,
  TicketAccessNotApprovedError,
  TicketLimitReachedError,
  TicketPaymentNotAvailableError,
  TicketSalesClosedError,
  TicketsSoldOutError
} from '@pulso/database';
import type { FastifyInstance, FastifyReply } from 'fastify';
import { z } from 'zod';

import { resolveBearerUser, sendUnauthenticated } from './auth.js';
import { issueTicketToken, verifyTicketToken } from './ticket-token.js';

const eventParamsSchema = z.object({ eventId: z.uuid() });
const ticketTypeParamsSchema = z.object({ ticketTypeId: z.uuid() });

/**
 * DEC-0022 §2 and §3. Ticket types, claiming, "Mes billets", and the door.
 *
 * The signing secret lives here and nowhere else: the repository deals in
 * rows, and a token is derived on the way out. Nothing stores a token, so
 * rotating the secret invalidates every outstanding QR rather than leaving
 * stale ones that still verify.
 */
export function registerTicketingRoutes(
  app: FastifyInstance,
  authRepository: AuthRepository,
  ticketingRepository: TicketingRepository,
  ticketSigningSecret: string,
  applicationFeeBps: number
) {
  /**
   * DEC-0022 §1. The commission sits on top of the organizer's price, so the
   * two numbers travel together: what the organizer set, and what the buyer
   * pays. Computed here from configuration rather than stored on the row, so
   * changing the rate does not need a migration - and rounded per ticket, the
   * same way issuance rounds it, so the price quoted is the price charged.
   */
  const withFee = (type: TicketType) => {
    if (applicationFeeBps <= 0 || type.priceCents <= 0) return type;
    const feeCents = Math.ceil((type.priceCents * applicationFeeBps) / 10_000);
    return {
      ...type,
      feeCents,
      buyerPriceCents: type.priceCents + feeCents
    };
  };
  const withToken = (ticket: HeldTicket) => ({
    ...ticket,
    token: issueTicketToken(
      {
        ticketId: ticket.id,
        eventId: ticket.eventId,
        issuedAt: new Date(ticket.issuedAt).getTime()
      },
      ticketSigningSecret
    )
  });

  // Public to any signed-in account: what is on sale, and how much is left.
  app.get('/events/:eventId/ticket-types', async (request, reply) => {
    const user = await resolveBearerUser(request, authRepository);
    if (!user) return sendUnauthenticated(reply);
    const { eventId } = eventParamsSchema.parse(request.params);
    const types = await ticketingRepository.listTicketTypes(eventId);
    return ticketTypesResponseSchema.parse({ data: types.map(withFee) });
  });

  app.post('/me/events/:eventId/ticket-types', async (request, reply) => {
    const user = await resolveBearerUser(request, authRepository);
    if (!user) return sendUnauthenticated(reply);
    const { eventId } = eventParamsSchema.parse(request.params);
    const input = createTicketTypeRequestSchema.parse(request.body);
    try {
      const created = await ticketingRepository.createTicketType(
        user.id,
        eventId,
        {
          name: input.name,
          priceCents: input.priceCents,
          quantity: input.quantity,
          maxPerAccount: input.maxPerAccount,
          salesOpenAt: input.salesOpenAt,
          salesCloseAt: input.salesCloseAt
        }
      );
      return reply.status(201).send({ data: withFee(created) });
    } catch (error) {
      if (error instanceof NotTicketOrganizerError) {
        return reply.status(404).send({
          error: {
            code: 'EVENT_NOT_FOUND',
            message: 'The event was not found.'
          }
        });
      }
      throw error;
    }
  });

  app.delete('/me/ticket-types/:ticketTypeId', async (request, reply) => {
    const user = await resolveBearerUser(request, authRepository);
    if (!user) return sendUnauthenticated(reply);
    const { ticketTypeId } = ticketTypeParamsSchema.parse(request.params);
    const deleted = await ticketingRepository.deleteTicketType(
      user.id,
      ticketTypeId
    );
    if (!deleted) {
      // Either it is not theirs, or tickets already exist for it. Deleting
      // it in the second case would cascade live admissions away and turn
      // somebody's ticket into a 404 at the door.
      return reply.status(409).send({
        error: {
          code: 'TICKET_TYPE_IN_USE',
          message:
            'This ticket type cannot be deleted: tickets have already been issued.'
        }
      });
    }
    return reply.status(204).send();
  });

  app.post('/events/:eventId/tickets', async (request, reply) => {
    const user = await resolveBearerUser(request, authRepository);
    if (!user) return sendUnauthenticated(reply);
    const { ticketTypeId, quantity } = claimTicketsRequestSchema.parse(
      request.body
    );
    try {
      const issued = await ticketingRepository.issueTickets(
        user.id,
        ticketTypeId,
        quantity
      );
      return reply
        .status(201)
        .send({ data: issued.map((ticket) => withToken(ticket)) });
    } catch (error) {
      const refusal = describeIssuanceRefusal(error);
      if (refusal) return reply.status(refusal.status).send(refusal.body);
      throw error;
    }
  });

  app.get('/me/tickets', async (request, reply) => {
    const user = await resolveBearerUser(request, authRepository);
    if (!user) return sendUnauthenticated(reply);
    const tickets = await ticketingRepository.listMyTickets(user.id);
    return myTicketsResponseSchema.parse({
      data: tickets.map((ticket) => withToken(ticket))
    });
  });

  /**
   * The door. DEC-0022 §3: the signature says Pulso issued this QR, and only
   * the server can say whether it has already been used, so both checks
   * happen here and the answer names which one failed.
   */
  app.post('/me/events/:eventId/scan', async (request, reply) => {
    const user = await resolveBearerUser(request, authRepository);
    if (!user) return sendUnauthenticated(reply);
    const { eventId } = eventParamsSchema.parse(request.params);
    if (!(await ticketingRepository.isEventOrganizer(eventId, user.id))) {
      return reply.status(404).send({
        error: { code: 'EVENT_NOT_FOUND', message: 'The event was not found.' }
      });
    }
    const { token } = scanTicketRequestSchema.parse(request.body);

    const verified = verifyTicketToken(token, ticketSigningSecret);
    if (!verified.ok) {
      // Never looked up, because there is nothing trustworthy to look up
      // with. Reported apart from 'unknown' so a door can tell a fake QR from
      // a real ticket that was cancelled.
      return scanTicketResponseSchema.parse({ data: { result: 'forged' } });
    }

    return scanTicketResponseSchema.parse({
      data: await ticketingRepository.redeem(
        verified.payload.ticketId,
        eventId,
        user.id
      )
    });
  });

  app.get('/me/events/:eventId/admissions', async (request, reply) => {
    const user = await resolveBearerUser(request, authRepository);
    if (!user) return sendUnauthenticated(reply);
    const { eventId } = eventParamsSchema.parse(request.params);
    if (!(await ticketingRepository.isEventOrganizer(eventId, user.id))) {
      return reply.status(404).send({
        error: { code: 'EVENT_NOT_FOUND', message: 'The event was not found.' }
      });
    }
    return eventAdmissionsResponseSchema.parse({
      data: await ticketingRepository.countAdmissions(eventId)
    });
  });
}

/**
 * Every refusal issuance can produce, mapped to a code the client can act on.
 * Sold out and "you already have four" are different problems for the person
 * holding the phone, and a single 409 would hide which.
 */
function describeIssuanceRefusal(
  error: unknown
): { status: number; body: Parameters<FastifyReply['send']>[0] } | undefined {
  if (error instanceof TicketPaymentNotAvailableError) {
    return {
      status: 409,
      body: {
        error: {
          code: 'PAYMENT_NOT_AVAILABLE',
          message:
            'Paid tickets are not available yet. Only free ticket types can be claimed.'
        }
      }
    };
  }
  if (error instanceof TicketsSoldOutError) {
    return {
      status: 409,
      body: {
        error: {
          code: 'SOLD_OUT',
          message: 'There are not enough tickets left.'
        }
      }
    };
  }
  if (error instanceof TicketLimitReachedError) {
    return {
      status: 409,
      body: {
        error: {
          code: 'LIMIT_REACHED',
          message: `This account may hold at most ${error.maxPerAccount} of this ticket type.`
        }
      }
    };
  }
  if (error instanceof TicketSalesClosedError) {
    return {
      status: 409,
      body: {
        error: {
          code: 'SALES_CLOSED',
          message: 'This ticket type is not on sale right now.'
        }
      }
    };
  }
  if (error instanceof TicketAccessNotApprovedError) {
    return {
      status: 403,
      body: {
        error: {
          code: 'ACCESS_NOT_APPROVED',
          message: 'The organizer must approve you before you can get a ticket.'
        }
      }
    };
  }
  return undefined;
}
