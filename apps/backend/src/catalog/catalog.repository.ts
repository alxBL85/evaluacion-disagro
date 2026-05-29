import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CatalogItem } from '@prisma/client';

@Injectable()
export class CatalogRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findAllActive(): Promise<CatalogItem[]> {
    return this.prisma.catalogItem.findMany({
      where: { isActive: true },
      orderBy: [{ type: 'asc' }, { name: 'asc' }],
    });
  }

  async findByIds(ids: string[]): Promise<CatalogItem[]> {
    return this.prisma.catalogItem.findMany({
      where: {
        id: { in: ids },
        isActive: true,
      },
    });
  }
}
