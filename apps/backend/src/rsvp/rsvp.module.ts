import { Module } from '@nestjs/common';
import { RsvpController } from './rsvp.controller';
import { RsvpService } from './rsvp.service';
import { RsvpRepository } from './rsvp.repository';
import { EventsModule } from '../events/events.module';
import { CatalogModule } from '../catalog/catalog.module';

@Module({
  imports: [EventsModule, CatalogModule],
  controllers: [RsvpController],
  providers: [RsvpService, RsvpRepository],
})
export class RsvpModule {}
