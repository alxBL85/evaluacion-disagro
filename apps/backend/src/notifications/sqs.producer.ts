import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  SQSClient,
  SendMessageCommand,
  SendMessageCommandInput,
} from '@aws-sdk/client-sqs';
import { SalesNotificationMessage } from '@event-platform/commons';

@Injectable()
export class SqsProducer {
  private readonly logger = new Logger(SqsProducer.name);
  private readonly client: SQSClient;
  private readonly queueUrl: string;

  constructor(private readonly config: ConfigService) {
    this.client = new SQSClient({
      region: this.config.get<string>('AWS_REGION', 'us-east-1'),
      // En desarrollo local apunta a LocalStack
      ...(this.config.get('NODE_ENV') !== 'production' && {
        endpoint: this.config.get<string>(
          'AWS_ENDPOINT',
          'http://localhost:4566',
        ),
        credentials: {
          accessKeyId: 'test',
          secretAccessKey: 'test',
        },
      }),
    });

    this.queueUrl = this.config.getOrThrow<string>('SQS_QUEUE_URL');
  }

  async sendNotification(message: SalesNotificationMessage): Promise<void> {
    const input: SendMessageCommandInput = {
      QueueUrl: this.queueUrl,
      MessageBody: JSON.stringify(message),
      MessageAttributes: {
        eventType: {
          DataType: 'String',
          StringValue: 'RSVP_CONFIRMED',
        },
      },
    };

    try {
      const result = await this.client.send(new SendMessageCommand(input));
      this.logger.log(
        `Notification queued — MessageId: ${result.MessageId} | RSVP: ${message.rsvpId}`,
      );
    } catch (error) {
      // El fallo de notificación NO debe impedir la confirmación del RSVP
      // El RSVP ya fue creado exitosamente — solo logueamos el error
      this.logger.error(
        `Failed to queue notification for RSVP: ${message.rsvpId}`,
        error,
      );
    }
  }
}
