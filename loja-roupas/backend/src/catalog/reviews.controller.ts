import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { Roles, RolesGuard } from '../auth/guards/roles.guard';
import { CreateReviewDto, ModerateReviewDto } from './dto/review.dto';
import { ReviewsService } from './reviews.service';

@Controller('products/:slug/reviews')
export class ProductReviewsController {
  constructor(private readonly reviews: ReviewsService) {}
  @Get() list(@Param('slug') slug: string) { return this.reviews.publicForProduct(slug); }
  @Post() create(@Param('slug') slug: string, @Body() dto: CreateReviewDto) { return this.reviews.create(slug, dto); }
}

@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('owner', 'staff')
@Controller('admin/reviews')
export class AdminReviewsController {
  constructor(private readonly reviews: ReviewsService) {}
  @Get() list(@Query('status') status?: string) { return this.reviews.adminList(status); }
  @Patch(':id') moderate(@Param('id') id: string, @Body() dto: ModerateReviewDto) { return this.reviews.moderate(id, dto); }
}
