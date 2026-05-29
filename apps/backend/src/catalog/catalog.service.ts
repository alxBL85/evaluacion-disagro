import { Injectable } from '@nestjs/common';
import { CatalogRepository } from './catalog.repository';
import { CatalogResponseDto, CatalogItemDto } from '@event-platform/commons';
import { CatalogItem } from '@prisma/client';

@Injectable()
export class CatalogService {
  constructor(private readonly catalogRepository: CatalogRepository) {}

  private toDto(item: CatalogItem): CatalogItemDto {
    return {
      id: item.id,
      name: item.name,
      type: item.type as 'SERVICE' | 'PRODUCT',
      price: Number(item.price),
    };
  }

  async getCatalog(): Promise<CatalogResponseDto> {
    const items = await this.catalogRepository.findAllActive();

    const services = items
      .filter((item) => item.type === 'SERVICE')
      .map((item) => this.toDto(item));
    const products = items
      .filter((item) => item.type === 'PRODUCT')
      .map((item) => this.toDto(item));

    return {
      services,
      products,
    };
  }
}
