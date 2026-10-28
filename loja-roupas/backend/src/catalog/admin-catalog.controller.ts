import { Body, Controller, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { Roles, RolesGuard } from '../auth/guards/roles.guard';
import { CatalogService } from './catalog.service';
import {
  CreateCategoryDto, CreateProductDto, CreateVariantDto, UpdateCategoryDto, UpdateProductDto, UpdateVariantDto,
} from './dto/catalog.dto';

@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('owner', 'staff')
@Controller('admin')
export class AdminCatalogController {
  constructor(private readonly catalog: CatalogService) {}

  @Get('products')
  list() { return this.catalog.listAllProducts(); }

  @Get('categories')
  categories() { return this.catalog.listAllCategories(); }

  @Post('products')
  create(@Body() dto: CreateProductDto) { return this.catalog.createProduct(dto); }

  @Patch('products/:id')
  update(@Param('id') id: string, @Body() dto: UpdateProductDto) { return this.catalog.updateProduct(id, dto); }

  @Post('products/:id/variants')
  addVariant(@Param('id') id: string, @Body() dto: CreateVariantDto) { return this.catalog.addVariant(id, dto); }

  @Patch('variants/:id')
  updateVariant(@Param('id') id: string, @Body() dto: UpdateVariantDto) { return this.catalog.updateVariant(id, dto); }

  @Post('categories')
  createCategory(@Body() dto: CreateCategoryDto) { return this.catalog.createCategory(dto); }

  @Patch('categories/:id')
  updateCategory(@Param('id') id: string, @Body() dto: UpdateCategoryDto) { return this.catalog.updateCategory(id, dto); }
}
