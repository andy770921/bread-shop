import {
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { FavoriteService } from './favorite.service';
import { AuthGuard } from '../auth/guards/auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';

@ApiTags('Favorites')
@Controller('api/favorites')
@UseGuards(AuthGuard)
export class FavoriteController {
  constructor(private favoriteService: FavoriteService) {}

  @Get()
  getAll(@CurrentUser() user: any) {
    return this.favoriteService.getAll(user.id);
  }

  @Post(':productId')
  add(
    @CurrentUser() user: any,
    @Param('productId', ParseIntPipe) productId: number,
  ) {
    return this.favoriteService.add(user.id, productId);
  }

  @Delete(':productId')
  remove(
    @CurrentUser() user: any,
    @Param('productId', ParseIntPipe) productId: number,
  ) {
    return this.favoriteService.remove(user.id, productId);
  }
}
