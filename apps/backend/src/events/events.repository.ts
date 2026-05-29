import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Event, Prisma } from '@prisma/client';

@Injectable()
export class EventsRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findActive(): Promise<Event | null> {
    return this.prisma.event.findFirst({
      where: { isActive: true },
      orderBy: { scheduledAt: 'asc' },
    });
  }

  async findById(id: string): Promise<Event | null> {
    return this.prisma.event.findUnique({
      where: { id },
    });
  }

  /**
   *
   * @param eventId
   * @param tx La transaccion, compartida por el módulo RSVP
   * @returns el rusultado del update que decrementa el contador availableSlots.
   * @description el método recibe la transacción, garantizando que el decremento y la creación del RSVP ocurran en la misma transacción atómica.
   */
  async decrementSlot(
    eventId: string,
    tx: Prisma.TransactionClient, // Parameters<Parameters<PrismaService['$transaction']>[0]>[0],
  ): Promise<number> {
    const result = await tx.$executeRaw`
      UPDATE events
      SET "availableSlots" = "availableSlots" - 1
      WHERE id = ${eventId}::text
      AND "availableSlots" > 0
    `;
    return result;
  }
}
