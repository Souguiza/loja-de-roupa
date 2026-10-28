import { Controller, Get, Param, Query } from '@nestjs/common';
import { CatalogService } from './catalog.service';

@Controller()
export class CatalogController {
  constructor(private readonly catalog: CatalogService) {}

  @Get('products')
  list(@Query('category') category?: string) {
    return this.catalog.listProducts(category);
  }

  @Get('products/:slug')
  one(@Param('slug') slug: string) {
    return this.catalog.getProduct(slug);
  }

  @Get('categories')
  categories() {
    return this.catalog.listCategories();
  }
}
