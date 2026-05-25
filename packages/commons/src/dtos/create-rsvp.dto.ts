export interface CreateRsvpDto {
  eventId: string;
  firstName: string;
  lastName: string;
  email: string;
  attendanceDate: string;
  selectedItemIds: string[];
}

export interface RsvpResponseDto {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  attendanceDate: string;
  selections: CatalogItemDto[];
  servicesDiscount: number;
  productsDiscount: number;
  createdAt: string;
}

import { CatalogItemDto } from "./catalog-item.dto";
