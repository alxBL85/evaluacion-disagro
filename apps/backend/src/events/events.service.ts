import { Injectable, NotFoundException } from '@nestjs/common';
import { EventsRepository } from './events.repository';
import { EventStatus } from '@event-platform/commons';

@Injectable()
export class EventsService {
  constructor(private readonly eventsRepository: EventsRepository) {}

  async getStatus(): Promise<EventStatus> {
    const event = await this.eventsRepository.findActive();

    if (!event) {
      throw new NotFoundException('No se encontró evento activo');
    }

    return this.toDto(event);
  }

  private toDto(event: {
    name: string;
    id: string;
    scheduledAt: Date;
    maxCapacity: number;
    availableSlots: number;
    isActive: boolean;
    createdAt: Date;
    updatedAt: Date;
  }): EventStatus {
    return {
      id: event.id,
      name: event.name,
      scheduledAt: event.scheduledAt.toISOString(),
      availableSlots: event.availableSlots,
      maxCapacity: event.maxCapacity,
      isFull: event.availableSlots <= 0,
    };
  }
}
