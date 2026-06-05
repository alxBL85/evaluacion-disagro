import { Module } from '@nestjs/common';
import { SqsProducer } from './sqs.producer';
import { SqsConsumer } from './sqs.consumer';
import { RsvpRepository } from '../rsvp/rsvp.repository';

@Module({
  providers: [SqsProducer, SqsConsumer, RsvpRepository],
  exports: [SqsProducer],
})
export class NotificationsModule {}
