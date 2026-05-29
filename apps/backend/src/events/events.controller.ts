import { Controller, Get } from '@nestjs/common';
import { EventsService } from './events.service';
import { EventStatus } from '@event-platform/commons';

@Controller('events')
export class EventsController {
  constructor(private readonly eventsService: EventsService) {}

  @Get('status')
  async getStatus(): Promise<EventStatus> {
    return this.eventsService.getStatus();
  }
}
