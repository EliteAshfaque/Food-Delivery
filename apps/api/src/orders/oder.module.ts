import { Module, forwardRef } from '@nestjs/common';
import { OrdersController } from './oder.controller';
import { OrdersService } from './oder.service';
import { AuthModule } from '../auth/auth.modules';
import { GatewayModule } from '../gateway/gateway.module';
import { DriverModule } from '../driver/driver.module';
import { OffersModule } from '../offers/offers.module';
import { LocationModule } from '../location/location.module';
import { PaymentsModule } from '../payments/payment.modules';
import { OperationsModule } from '../operations/operations.module';

@Module({
  imports: [
    AuthModule,
    GatewayModule,
    forwardRef(() => DriverModule),
    OffersModule,
    LocationModule,
    PaymentsModule,
    OperationsModule,
  ],
  controllers: [OrdersController],
  providers: [OrdersService],
  exports: [OrdersService],
})
export class OrdersModule {}
