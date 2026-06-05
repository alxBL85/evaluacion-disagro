import {
  Injectable,
  Logger,
  OnModuleInit,
  OnModuleDestroy,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  SQSClient,
  ReceiveMessageCommand,
  DeleteMessageCommand,
} from '@aws-sdk/client-sqs';
import { RsvpRepository } from '../rsvp/rsvp.repository';
import { SalesNotificationMessage } from '@event-platform/commons';

@Injectable()
export class SqsConsumer implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(SqsConsumer.name);
  private readonly client: SQSClient;
  private readonly queueUrl: string;
  private isRunning = false;
  private pollTimeout: NodeJS.Timeout | null = null;

  constructor(
    private readonly config: ConfigService,
    private readonly rsvpRepository: RsvpRepository,
  ) {
    this.client = new SQSClient({
      region: this.config.get<string>('AWS_REGION', 'us-east-1'),
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

  onModuleInit() {
    this.isRunning = true;
    this.logger.log('SQS Consumer started');
    this.poll();
  }

  onModuleDestroy() {
    this.isRunning = false;
    if (this.pollTimeout) {
      clearTimeout(this.pollTimeout);
    }
    this.logger.log('SQS Consumer stopped');
  }

  private async poll(): Promise<void> {
    if (!this.isRunning) return;

    try {
      const response = await this.client.send(
        new ReceiveMessageCommand({
          QueueUrl: this.queueUrl,
          MaxNumberOfMessages: 10,
          WaitTimeSeconds: 20, // long polling
          VisibilityTimeout: 60,
          MessageAttributeNames: ['All'],
        }),
      );

      const messages = response.Messages ?? [];

      for (const message of messages) {
        await this.processMessage(message.Body!, message.ReceiptHandle!);
      }
    } catch (error) {
      this.logger.error('Error polling SQS', error);
    } finally {
      // Continúa el ciclo de polling
      if (this.isRunning) {
        this.pollTimeout = setTimeout(() => this.poll(), 0);
      }
    }
  }

  private async processMessage(
    body: string,
    receiptHandle: string,
  ): Promise<void> {
    let message: SalesNotificationMessage;

    try {
      message = JSON.parse(body);
    } catch {
      this.logger.error(`Invalid message body — cannot parse JSON: ${body}`);
      // Mensaje malformado — lo eliminamos para no bloquear la cola
      await this.deleteMessage(receiptHandle);
      return;
    }

    try {
      // Idempotencia: verificar si ya fue procesado
      const rsvp = await this.rsvpRepository.findById(message.rsvpId);

      if (!rsvp) {
        this.logger.warn(`RSVP not found for notification: ${message.rsvpId}`);
        await this.deleteMessage(receiptHandle);
        return;
      }

      if (rsvp.notificationStatus === 'SENT') {
        this.logger.warn(
          `Duplicate notification ignored for RSVP: ${message.rsvpId}`,
        );
        await this.deleteMessage(receiptHandle);
        return;
      }

      // Simular notificación al equipo de ventas con log estructurado
      this.logger.log(
        JSON.stringify({
          event: 'SALES_NOTIFICATION',
          rsvpId: message.rsvpId,
          customer: {
            firstName: message.customerFirstName,
            lastName: message.customerLastName,
            email: message.customerEmail,
          },
          attendanceDate: message.attendanceDate,
          selections: message.selections.map((s) => ({
            name: s.name,
            type: s.type,
            price: s.price,
          })),
          discounts: {
            services: `${message.servicesDiscount}%`,
            products: `${message.productsDiscount}%`,
          },
          confirmedAt: message.confirmedAt,
          processedAt: new Date().toISOString(),
        }),
      );

      // Marcar como enviado en la base de datos
      await this.rsvpRepository.markNotificationSent(message.rsvpId);

      // Eliminar mensaje de la cola
      await this.deleteMessage(receiptHandle);

      this.logger.log(`Notification processed for RSVP: ${message.rsvpId}`);
    } catch (error) {
      // NO eliminamos el mensaje — SQS lo reintentará hasta maxReceiveCount (3)
      // Tras 3 intentos fallidos irá a la DLQ automáticamente
      this.logger.error(
        `Failed to process notification for RSVP: ${message.rsvpId}`,
        error,
      );
    }
  }

  private async deleteMessage(receiptHandle: string): Promise<void> {
    await this.client.send(
      new DeleteMessageCommand({
        QueueUrl: this.queueUrl,
        ReceiptHandle: receiptHandle,
      }),
    );
  }
}
