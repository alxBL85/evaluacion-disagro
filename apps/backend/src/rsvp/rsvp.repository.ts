import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Prisma, Rsvp } from '@prisma/client';

export type RsvpWithSelections = Prisma.RsvpGetPayload<{
  include: { selections: { include: { catalogItem: true } } };
}>;

@Injectable()
export class RsvpRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findByEmailAndEvent(
    email: string,
    eventId: string,
  ): Promise<RsvpWithSelections | null> {
    return this.prisma.rsvp.findUnique({
      where: { eventId_email: { eventId, email } },
      include: {
        selections: {
          include: { catalogItem: true },
        },
      },
    });
  }

  async findById(id: string): Promise<RsvpWithSelections | null> {
    return this.prisma.rsvp.findUnique({
      where: { id },
      include: {
        selections: {
          include: { catalogItem: true },
        },
      },
    });
  }

  async create(
    data: {
      eventId: string;
      firstName: string;
      lastName: string;
      email: string;
      attendanceDate: Date;
      servicesDiscount: number;
      productsDiscount: number;
      selectedItemIds: string[];
    },
    tx: Prisma.TransactionClient,
  ): Promise<Rsvp> {
    return tx.rsvp.create({
      data: {
        eventId: data.eventId,
        firstName: data.firstName,
        lastName: data.lastName,
        email: data.email,
        attendanceDate: data.attendanceDate,
        servicesDiscount: data.servicesDiscount,
        productsDiscount: data.productsDiscount,
        selections: {
          create: data.selectedItemIds.map((catalogItemId) => ({
            catalogItemId,
          })),
        },
      },
    });
  }

  async markNotificationSent(id: string): Promise<void> {
    await this.prisma.rsvp.update({
      where: { id },
      data: {
        notificationStatus: 'SENT',
        notificationSentAt: new Date(),
      },
    });
  }
}
