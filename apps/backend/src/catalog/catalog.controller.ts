import { Controller, Get } from '@nestjs/common';
import { CatalogService } from './catalog.service';
import { CatalogResponseDto } from '@event-platform/commons';

@Controller('catalog')
export class CatalogController {
  constructor(private readonly catalogService: CatalogService) {}

  @Get()
  async getCatalog(): Promise<CatalogResponseDto> {
    return this.catalogService.getCatalog();
  }
}
