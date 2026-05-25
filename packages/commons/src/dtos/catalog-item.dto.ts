export type CatalogItemType = "SERVICE" | "PRODUCT";

export interface CatalogItemDto {
  id: string;
  name: string;
  type: CatalogItemType;
  price: number;
}
