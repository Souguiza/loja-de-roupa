import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateReviewDto, ModerateReviewDto } from './dto/review.dto';

@Injectable()
export class ReviewsService {
  constructor(private readonly prisma: PrismaService) {}

  async publicForProduct(slug: string) {
    const product = await this.prisma.product.findFirst({ where: { slug, active: true }, select: { id: true } });
    if (!product) throw new NotFoundException('Produto não encontrado.');
    const [summary, reviews] = await Promise.all([
      this.prisma.review.aggregate({ where: { productId: product.id, status: 'APPROVED' }, _avg: { rating: true }, _count: { _all: true } }),
      this.prisma.review.findMany({ where: { productId: product.id, status: 'APPROVED' }, select: { id: true, rating: true, comment: true, createdAt: true }, orderBy: { createdAt: 'desc' }, take: 20 }),
    ]);
    return { ratingAverage: summary._avg.rating, ratingCount: summary._count._all, reviews };
  }

  async create(slug: string, dto: CreateReviewDto) {
    const product = await this.prisma.product.findFirst({ where: { slug, active: true }, select: { id: true } });
    if (!product) throw new NotFoundException('Produto não encontrado.');
    const order = await this.prisma.order.findUnique({ where: { publicToken: dto.publicToken }, select: { id: true, customerId: true, status: true, items: { where: { variant: { productId: product.id } }, select: { id: true }, take: 1 } } });
    if (!order || order.items.length === 0) throw new NotFoundException('Não encontramos uma compra deste produto com esse link.');
    if (order.status !== 'DELIVERED') throw new BadRequestException('A avaliação fica disponível depois que o pedido for entregue.');
    try {
      return await this.prisma.review.create({ data: { productId: product.id, orderId: order.id, customerId: order.customerId, rating: dto.rating, comment: dto.comment.trim(), status: 'PENDING' }, select: { id: true, status: true } });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') throw new ConflictException('Você já enviou uma avaliação deste produto neste pedido.');
      throw error;
    }
  }

  adminList(status?: string) {
    const filter = status && ['PENDING', 'APPROVED', 'REJECTED'].includes(status) ? status as 'PENDING' | 'APPROVED' | 'REJECTED' : 'PENDING';
    return this.prisma.review.findMany({ where: { status: filter }, include: { product: { select: { name: true, slug: true } }, order: { select: { number: true } } }, orderBy: { createdAt: 'desc' } });
  }

  async moderate(id: string, dto: ModerateReviewDto) {
    const result = await this.prisma.review.updateMany({ where: { id, status: { in: ['PENDING', 'APPROVED', 'REJECTED'] } }, data: { status: dto.status } });
    if (!result.count) throw new NotFoundException('Avaliação não encontrada.');
    return this.prisma.review.findUniqueOrThrow({ where: { id }, select: { id: true, status: true } });
  }
}
