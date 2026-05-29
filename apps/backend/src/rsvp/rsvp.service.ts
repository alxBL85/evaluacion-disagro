import {
  Injectable,
  ConflictException,
  BadRequestException,
  NotFoundException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { RsvpRepository } from './rsvp.repository';
import { EventsRepository } from '../events/events.repository';
import { CatalogRepository } from '../catalog/catalog.repository';
import { CreateRsvpBodyDto } from './create-rsvp.dto';
import { calculateDiscounts } from './discount.helper';
import { RsvpResponseDto, CatalogItemDto } from '@event-platform/commons';
import { Prisma } from '@prisma/client';

@Injectable()
export class RsvpService {
  private readonly logger = new Logger(RsvpService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly rsvpRepository: RsvpRepository,
    private readonly eventsRepository: EventsRepository,
    private readonly catalogRepository: CatalogRepository,
  ) {}

  async confirm(
    dto: CreateRsvpBodyDto,
  ): Promise<{ rsvp: RsvpResponseDto; isNew: boolean }> {
    // 1. Verificar idempotencia — si el email ya confirmó, retornar el RSVP existente
    const existing = await this.rsvpRepository.findByEmailAndEvent(
      dto.email,
      dto.eventId,
    );

    if (existing) {
      this.logger.log(`Duplicate RSVP request for email: ${dto.email}`);
      return {
        rsvp: this.toDto(existing, []),
        isNew: false,
      };
    }

    // 2. Validar que el evento existe y está activo
    const event = await this.eventsRepository.findById(dto.eventId);

    if (!event || !event.isActive) {
      throw new NotFoundException('Event not found or inactive');
    }

    // 3. Validar que los items seleccionados existen y están activos
    const catalogItems = await this.catalogRepository.findByIds(
      dto.selectedItemIds,
    );

    if (catalogItems.length !== dto.selectedItemIds.length) {
      throw new BadRequestException(
        'One or more selected items are invalid or inactive',
      );
    }

    // 4. Calcular descuentos
    const itemDtos: CatalogItemDto[] = catalogItems.map((item) => ({
      id: item.id,
      name: item.name,
      type: item.type as 'SERVICE' | 'PRODUCT',
      price: Number(item.price),
    }));

    const { servicesDiscount, productsDiscount } = calculateDiscounts(itemDtos);

    // 5. Transacción atómica: decrementar slot + crear RSVP
    const rsvp = await this.prisma.$transaction(
      async (tx) => {
        const decremented = await this.eventsRepository.decrementSlot(
          dto.eventId,
          tx,
        );

        if (decremented === 0) {
          throw new ConflictException('El evento ha alcanzado su cupo máximo');
        }

        return this.rsvpRepository.create(
          {
            eventId: dto.eventId,
            firstName: dto.firstName,
            lastName: dto.lastName,
            email: dto.email,
            attendanceDate: new Date(dto.attendanceDate),
            servicesDiscount,
            productsDiscount,
            selectedItemIds: dto.selectedItemIds,
          },
          tx,
        );
      },
      {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      },
    );

    this.logger.log(`New RSVP confirmed: ${rsvp.id} for ${dto.email}`);

    // 6. Cargar el RSVP completo con selections para la respuesta
    const rsvpWithSelections = await this.rsvpRepository.findById(rsvp.id);

    return {
      rsvp: this.toDto(rsvpWithSelections!, itemDtos),
      isNew: true,
    };
  }

  async findById(id: string): Promise<RsvpResponseDto> {
    const rsvp = await this.rsvpRepository.findById(id);

    if (!rsvp) {
      throw new NotFoundException(`RSVP ${id} not found`);
    }

    return this.toDto(rsvp);
  }

  private toDto(
    rsvp: NonNullable<Awaited<ReturnType<RsvpRepository['findById']>>>,
    itemDtos?: CatalogItemDto[],
  ): RsvpResponseDto {
    const selections: CatalogItemDto[] =
      itemDtos && itemDtos.length > 0
        ? itemDtos
        : rsvp.selections.map((s) => ({
            id: s.catalogItem.id,
            name: s.catalogItem.name,
            type: s.catalogItem.type as 'SERVICE' | 'PRODUCT',
            price: Number(s.catalogItem.price),
          }));

    return {
      id: rsvp.id,
      eventId: rsvp.eventId,
      firstName: rsvp.firstName,
      lastName: rsvp.lastName,
      email: rsvp.email,
      attendanceDate: rsvp.attendanceDate.toISOString(),
      selections,
      servicesDiscount: rsvp.servicesDiscount,
      productsDiscount: rsvp.productsDiscount,
      isNew: false,
      createdAt: rsvp.createdAt.toISOString(),
    };
  }
}
