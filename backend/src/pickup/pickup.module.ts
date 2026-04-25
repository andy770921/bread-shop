import { Module } from '@nestjs/common';
import { PickupController } from './pickup.controller';
import { PickupService } from './pickup.service';
import { PickupAvailabilityController } from './pickup-availability.controller';

@Module({
  controllers: [PickupController, PickupAvailabilityController],
  providers: [PickupService],
  exports: [PickupService],
})
export class PickupModule {}
