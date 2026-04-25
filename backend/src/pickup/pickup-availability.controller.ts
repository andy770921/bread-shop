import { Controller, Get } from '@nestjs/common';
import { ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { InventoryService } from '../shop-settings/inventory.service';

@ApiTags('Pickup')
@Controller('api/pickup-availability')
export class PickupAvailabilityController {
  constructor(private inventory: InventoryService) {}

  @Get()
  @ApiOkResponse({ description: 'Public daily pickup capacity (full dates + cap mode).' })
  get() {
    return this.inventory.getAvailability();
  }
}
