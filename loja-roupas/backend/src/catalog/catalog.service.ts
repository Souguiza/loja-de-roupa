import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  CreateCategoryDto, CreateProductDto, CreateVariantDto, UpdateCategoryDto, UpdateProductDto, UpdateVariantDto,
} from './dto/catalog.dto';

const slugify = (s: string) =>
  s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
    .replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
const requiredSlug = (value: string) => {
  const slug = slugify(value);
  if (!slug) throw new BadRequestException('Use um nome com letras ou números para gerar a URL.');
  return slug;
};

const publicInclude = {
  category: { select: { name: true, slug: true } },
  images: { orderBy: { position: 'asc' as const }, select: { url: true } },
  variants: {
    where: { active: true },
    orderBy: [{ color: 'asc' as const }, { size: 'asc' as const }],
    select: {
      id: true, sku: true, size: true, color: true, colorHex: true,
      priceCents: true, compareAtPriceCents: true, stockQty: true,
    },
  },
};

@Injectable()
export class CatalogService {
  constructor(private readonly prisma: PrismaService) {}

  // ───────── Público ─────────
  listProducts(categorySlug?: string) {
    return this.prisma.product.findMany({
      where: { active: true, category: { active: true, ...(categorySlug ? { slug: categorySlug } : {}) } },
      include: publicInclude,
      orderBy: { createdAt: 'asc' },
    });
  }

  async getProduct(slug: string) {
    const product = await this.prisma.product.findFirst({
      where: { slug, active: true, category: { active: true } },
      include: publicInclude,
    });
    if (!product) throw new NotFoundException('Produto não encontrado');
    const [summary, reviews] = await Promise.all([
      this.prisma.review.aggregate({ where: { productId: product.id, status: 'APPROVED' }, _avg: { rating: true }, _count: { _all: true } }),
      this.prisma.review.findMany({ where: { productId: product.id, status: 'APPROVED' }, select: { id: true, rating: true, comment: true, createdAt: true }, orderBy: { createdAt: 'desc' }, take: 20 }),
    ]);
    return { ...product, ratingAverage: summary._avg.rating, ratingCount: summary._count._all, reviews };
  }

  listCategories() {
    return this.prisma.category.findMany({
      where: { active: true, products: { some: { active: true } } },
      select: { id: true, name: true, slug: true },
      orderBy: { name: 'asc' },
    });
  }

  // ───────── Admin ─────────
  listAllProducts() {
    return this.prisma.product.findMany({
      include: { category: true, images: true, variants: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  listAllCategories() {
    return this.prisma.category.findMany({ orderBy: { name: 'asc' } });
  }

  async createProduct(dto: CreateProductDto) {
    await this.ensureActiveCategory(dto.categoryId);
    const slug = requiredSlug(dto.slug ?? dto.name);
    try {
      return await this.prisma.product.create({
        data: {
          name: dto.name,
          slug,
          description: dto.description,
          shape: dto.shape,
          hasPrint: dto.hasPrint ?? false,
          shippingWeightGrams: dto.shippingWeightGrams,
          shippingWidthCm: dto.shippingWidthCm,
          shippingHeightCm: dto.shippingHeightCm,
          shippingLengthCm: dto.shippingLengthCm,
          categoryId: dto.categoryId,
          images: dto.images?.length ? { create: dto.images } : undefined,
          variants: { create: dto.variants.map((v) => this.variantData(slug, v)) },
        },
        include: { variants: true },
      });
    } catch (e) {
      this.rethrow(e);
    }
  }

  async updateProduct(id: string, dto: UpdateProductDto) {
    if (dto.categoryId !== undefined) await this.ensureActiveCategory(dto.categoryId);
    try {
      const { images, ...data } = dto;
      return await this.prisma.product.update({
        where: { id },
        data: { ...data, ...(images !== undefined ? { images: { deleteMany: {}, create: images } } : {}) },
      });
    } catch (e) {
      this.rethrow(e);
    }
  }

  async addVariant(productId: string, dto: CreateVariantDto) {
    const product = await this.prisma.product.findUnique({ where: { id: productId } });
    if (!product) throw new NotFoundException('Produto não encontrado');
    try {
      return await this.prisma.productVariant.create({
        data: { productId, ...this.variantData(product.slug, dto) },
      });
    } catch (e) {
      this.rethrow(e);
    }
  }

  async updateVariant(id: string, dto: UpdateVariantDto) {
    try {
      return await this.prisma.productVariant.update({ where: { id }, data: dto });
    } catch (e) {
      this.rethrow(e);
    }
  }

  async createCategory(dto: CreateCategoryDto) {
    try {
      return await this.prisma.category.create({
        data: { name: dto.name, slug: requiredSlug(dto.slug ?? dto.name) },
      });
    } catch (e) {
      this.rethrow(e);
    }
  }

  async updateCategory(id: string, dto: UpdateCategoryDto) {
    const name = dto.name?.trim();
    if (dto.name !== undefined && (!name || name.length < 2)) {
      throw new BadRequestException('O nome da categoria precisa ter pelo menos 2 caracteres.');
    }
    if (name === undefined && dto.active === undefined) {
      throw new BadRequestException('Informe um nome ou o status da categoria.');
    }
    try {
      return await this.prisma.category.update({ where: { id }, data: { ...(name !== undefined ? { name } : {}), ...(dto.active !== undefined ? { active: dto.active } : {}) } });
    } catch (e) {
      this.rethrow(e);
    }
  }

  private async ensureActiveCategory(id: string) {
    const category = await this.prisma.category.findFirst({ where: { id, active: true }, select: { id: true } });
    if (!category) throw new BadRequestException('Escolha uma categoria ativa.');
  }

  // ───────── helpers ─────────
  private variantData(productSlug: string, v: CreateVariantDto) {
    return {
      sku: (v.sku ?? `${productSlug}-${slugify(v.color)}-${v.size}`).toUpperCase(),
      size: v.size,
      color: v.color,
      colorHex: v.colorHex,
      priceCents: v.priceCents,
      compareAtPriceCents: v.compareAtPriceCents,
      stockQty: v.stockQty,
    };
  }

  private rethrow(e: unknown): never {
    if (e instanceof Prisma.PrismaClientKnownRequestError) {
      const code = e.code;
      if (code === 'P2002') throw new ConflictException('Já existe um registro com esses dados (slug, SKU ou variação)');
      if (code === 'P2025' || code === 'P2003') throw new NotFoundException('Registro relacionado não encontrado');
    }
    throw e;
  }
}
