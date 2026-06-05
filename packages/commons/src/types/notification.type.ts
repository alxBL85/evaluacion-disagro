import { CatalogItemDto } from "../dtos/catalog-item.dto";

export interface SalesNotificationMessage {
  rsvpId: string;
  eventId: string;
  customerFirstName: string;
  customerLastName: string;
  customerEmail: string;
  attendanceDate: string;
  selections: CatalogItemDto[];
  servicesDiscount: number;
  productsDiscount: number;
  confirmedAt: string;
}
