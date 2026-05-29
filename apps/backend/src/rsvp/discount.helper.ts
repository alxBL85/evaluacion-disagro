import {
  CatalogItemDto,
  DiscountResult,
  DISCOUNT_RULES,
} from '@event-platform/commons';

export function calculateDiscounts(
  selections: CatalogItemDto[],
): DiscountResult {
  const services = selections.filter((item) => item.type === 'SERVICE');
  const products = selections.filter((item) => item.type === 'PRODUCT');

  return {
    servicesDiscount: calculateServicesDiscount(services),
    productsDiscount: calculateProductsDiscount(products),
  };
}

function calculateServicesDiscount(services: CatalogItemDto[]): number {
  const { MIN_COUNT, BASE_DISCOUNT, PREMIUM_THRESHOLD_GTQ, PREMIUM_DISCOUNT } =
    DISCOUNT_RULES.SERVICES;

  if (services.length < MIN_COUNT) return 0;

  const total = services.reduce((sum, s) => sum + s.price, 0);

  if (total > PREMIUM_THRESHOLD_GTQ) return PREMIUM_DISCOUNT;

  return BASE_DISCOUNT;
}

function calculateProductsDiscount(products: CatalogItemDto[]): number {
  const { BASE_MIN_COUNT, BASE_DISCOUNT, PREMIUM_MIN_COUNT, PREMIUM_DISCOUNT } =
    DISCOUNT_RULES.PRODUCTS;

  if (products.length >= PREMIUM_MIN_COUNT) return PREMIUM_DISCOUNT;
  if (products.length >= BASE_MIN_COUNT) return BASE_DISCOUNT;

  return 0;
}
