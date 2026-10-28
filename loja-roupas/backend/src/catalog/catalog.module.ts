import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { AdminCatalogController } from './admin-catalog.controller';
import { AdminMediaController } from './admin-media.controller';
import { CatalogController } from './catalog.controller';
import { CatalogService } from './catalog.service';
import { AdminReviewsController, ProductReviewsController } from './reviews.controller';
import { ReviewsService } from './reviews.service';

@Module({
  imports: [AuthModule],
  controllers: [CatalogController, AdminCatalogController, AdminMediaController, ProductReviewsController, AdminReviewsController],
  providers: [CatalogService, ReviewsService],
})
export class CatalogModule {}
