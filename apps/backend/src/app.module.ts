import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from './prisma/prisma.module';
import { CatalogModule } from './catalog/catalog.module';
import { EventsModule } from './events/events.module';
import { RsvpModule } from './rsvp/rsvp.module';
import { NotificationsModule } from './notifications/notifications.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),
    PrismaModule,
    CatalogModule,
    EventsModule,
    RsvpModule,
    NotificationsModule,
  ],
})
export class AppModule {}
