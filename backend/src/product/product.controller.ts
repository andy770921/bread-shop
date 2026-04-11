import { Controller, Get, Param, ParseIntPipe, Query } from '@nestjs/common';
import { ApiTags, ApiQuery } from '@nestjs/swagger';
import { ProductService } from './product.service';

@ApiTags('Products')
@Controller('api/products')
export class ProductController {
  constructor(private productService: ProductService) {}

  @Get()
  @ApiQuery({ name: 'category', required: false, description: 'Category slug' })
  findAll(@Query('category') category?: string) {
    return this.productService.findAll(category);
  }

  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.productService.findOne(id);
  }
}
