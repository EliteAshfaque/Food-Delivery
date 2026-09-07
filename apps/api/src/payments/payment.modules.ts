import { Module } from '@nestjs/common';
import { PaymentsController } from './payment.controller';
import { PaymentsService } from './payment.service';
import { AuthModule } from '../auth/auth.modules';
import { GatewayModule } from '../gateway/gateway.module';
import { OffersModule } from '../offers/offers.module';
import { LocationModule } from '../location/location.module';
import { OperationsModule } from '../operations/operations.module';

@Module({
  imports: [
    AuthModule,
    GatewayModule,
    OffersModule,
    LocationModule,
    OperationsModule,
  ],
  controllers: [PaymentsController],
  providers: [PaymentsService],
  exports: [PaymentsService],
})
export class PaymentsModule {}
