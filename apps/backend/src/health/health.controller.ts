import { Controller, Get, HttpCode, HttpStatus, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ConfigService } from '@nestjs/config';

interface HealthStatus {
  status: 'ok' | 'degraded';
  timestamp: string;
  uptime: number;
  environment: string;
  checks: {
    database: 'ok' | 'error';
    sqs: 'ok' | 'skipped';
  };
}

@Controller('health')
export class HealthController {
  private readonly logger = new Logger(HealthController.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  @Get()
  @HttpCode(HttpStatus.OK)
  async check(): Promise<HealthStatus> {
    const checks = await Promise.allSettled([this.checkDatabase()]);

    const databaseOk = checks[0].status === 'fulfilled';

    const status: HealthStatus = {
      status: databaseOk ? 'ok' : 'degraded',
      timestamp: new Date().toISOString(),
      uptime: Math.floor(process.uptime()),
      environment: this.config.get<string>('NODE_ENV', 'development'),
      checks: {
        database: databaseOk ? 'ok' : 'error',
        sqs: 'skipped', // SQS se valida implícitamente cuando el consumer arranca
      },
    };

    if (!databaseOk) {
      this.logger.warn(`Health check degraded: database unreachable`);
    }

    return status;
  }

  private async checkDatabase(): Promise<void> {
    await this.prisma.$queryRaw`SELECT 1`;
  }
}
