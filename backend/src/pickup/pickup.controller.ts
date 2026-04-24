import { Controller, Get } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { PickupService } from './pickup.service';

@ApiTags('Pickup')
@Controller('api/pickup-settings')
export class PickupController {
  constructor(private readonly pickupService: PickupService) {}

  @Get()
  get() {
    return this.pickupService.getPublicSettings();
  }
}
