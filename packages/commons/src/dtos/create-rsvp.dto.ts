import { CatalogItemDto } from "./catalog-item.dto";

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
  eventId: string;
  firstName: string;
  lastName: string;
  email: string;
  attendanceDate: string;
  selections: CatalogItemDto[];
  servicesDiscount: number;
  productsDiscount: number;
  isNew: boolean;
  createdAt: string;
}
