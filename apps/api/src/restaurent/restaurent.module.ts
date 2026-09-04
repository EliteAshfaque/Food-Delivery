import { Module } from '@nestjs/common';
import { RestaurantsController } from './restaurent.controller';
import { RestaurantsService } from './restaurent-service';
import { AuthModule } from '../auth/auth.modules';

@Module({
  imports: [AuthModule],
  controllers: [RestaurantsController],
  providers: [RestaurantsService],
})
export class RestaurantsModule {}
