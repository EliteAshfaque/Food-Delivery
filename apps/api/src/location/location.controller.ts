import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import {
  LocationService,
  type DriverCoordinates,
} from './location.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@Controller('location')
@UseGuards(JwtAuthGuard)
export class LocationController {
  constructor(private locationService: LocationService) {}

  @Get(':orderId')
  getDriverLocation(
    @Param('orderId') orderId: string,
  ): Promise<DriverCoordinates | null> {
    return this.locationService.getDriverLocation(orderId);
  }
}
