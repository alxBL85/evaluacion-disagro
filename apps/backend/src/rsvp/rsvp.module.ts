import { Module } from '@nestjs/common';
import { RsvpController } from './rsvp.controller';
import { RsvpService } from './rsvp.service';
import { RsvpRepository } from './rsvp.repository';
import { EventsModule } from '../events/events.module';
import { CatalogModule } from '../catalog/catalog.module';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [EventsModule, CatalogModule, NotificationsModule],
  controllers: [RsvpController],
  providers: [RsvpService, RsvpRepository],
})
export class RsvpModule {}
