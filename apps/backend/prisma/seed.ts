import { PrismaClient, Prisma } from '@prisma/client';

const prisma = new PrismaClient();

const catalogItems: Prisma.CatalogItemCreateInput[] = [
  // ── Servicios ──────────────────────────────────────────
  {
    name: 'Consultoría Empresarial',
    type: 'SERVICE',
    price: new Prisma.Decimal('800.00'),
  },
  {
    name: 'Auditoría Financiera',
    type: 'SERVICE',
    price: new Prisma.Decimal('950.00'),
  },
  {
    name: 'Capacitación Corporativa',
    type: 'SERVICE',
    price: new Prisma.Decimal('600.00'),
  },
  {
    name: 'Soporte Técnico Premium',
    type: 'SERVICE',
    price: new Prisma.Decimal('450.00'),
  },
  {
    name: 'Gestión de Proyectos',
    type: 'SERVICE',
    price: new Prisma.Decimal('1200.00'),
  },
  // ── Productos ──────────────────────────────────────────
  {
    name: 'Licencia Software Pro',
    type: 'PRODUCT',
    price: new Prisma.Decimal('350.00'),
  },
  {
    name: 'Suite Ofimática Empresarial',
    type: 'PRODUCT',
    price: new Prisma.Decimal('499.99'),
  },
  {
    name: 'Antivirus Corporativo',
    type: 'PRODUCT',
    price: new Prisma.Decimal('199.99'),
  },
  {
    name: 'Servidor NAS 4TB',
    type: 'PRODUCT',
    price: new Prisma.Decimal('1850.00'),
  },
  {
    name: 'Router Empresarial',
    type: 'PRODUCT',
    price: new Prisma.Decimal('750.00'),
  },
  {
    name: 'Switch 24 Puertos',
    type: 'PRODUCT',
    price: new Prisma.Decimal('425.00'),
  },
  {
    name: 'UPS 1500VA',
    type: 'PRODUCT',
    price: new Prisma.Decimal('320.00'),
  },
  {
    name: 'Tóner HP LaserJet',
    type: 'PRODUCT',
    price: new Prisma.Decimal('149.99'),
  },
];

const event: Prisma.EventCreateInput = {
  name: process.env.EVENT_NAME ?? 'Feria de Promociones 2025',
  scheduledAt: new Date('2025-09-15T09:00:00.000Z'),
  maxCapacity: Number(process.env.EVENT_MAX_CAPACITY ?? 50),
  availableSlots: Number(process.env.EVENT_MAX_CAPACITY ?? 50),
  isActive: true,
};

async function main() {
  console.log('🌱 Starting seed...');

  // ── Catálogo ─────────────────────────────────────────────
  console.log('📦 Seeding catalog items...');

  let created = 0;
  let skipped = 0;

  for (const item of catalogItems) {
    const existing = await prisma.catalogItem.findFirst({
      where: { name: item.name },
    });

    if (!existing) {
      await prisma.catalogItem.create({ data: item });
      created++;
    } else {
      skipped++;
    }
  }

  console.log(`   ✔ ${created} items created, ${skipped} already existed`);

  // ── Evento ───────────────────────────────────────────────
  console.log('📅 Seeding event...');

  const existingEvent = await prisma.event.findFirst({
    where: { name: event.name },
  });

  if (!existingEvent) {
    const created = await prisma.event.create({ data: event });
    console.log(
      `   ✔ Event created: "${created.name}" (${created.maxCapacity} slots)`,
    );
  } else {
    console.log(`   ℹ Event already exists: "${existingEvent.name}"`);
  }

  // ── Resumen ──────────────────────────────────────────────
  const totalItems = await prisma.catalogItem.count();
  const services = await prisma.catalogItem.count({
    where: { type: 'SERVICE' },
  });
  const products = await prisma.catalogItem.count({
    where: { type: 'PRODUCT' },
  });
  const totalEvents = await prisma.event.count();

  console.log('\n📊 Database summary:');
  console.log(
    `   CatalogItems : ${totalItems} (${services} services, ${products} products)`,
  );
  console.log(`   Events       : ${totalEvents}`);
  console.log('\n✅ Seed completed successfully');
}

main()
  .catch((error) => {
    console.error('❌ Seed failed:', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
