import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.modules';
import { GatewayModule } from '../gateway/gateway.module';
import { OffersModule } from '../offers/offers.module';
import { DriverModule } from '../driver/driver.module';
import { PaymentsModule } from '../payments/payment.modules';
import { AdminBootstrapService } from './admin-bootstrap.service';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';
import { AdminGuard } from './guards/admin.guard';

@Module({
  imports: [
    AuthModule,
    GatewayModule,
    OffersModule,
    DriverModule,
    PaymentsModule,
  ],
  controllers: [AdminController],
  providers: [AdminService, AdminGuard, AdminBootstrapService],
  exports: [AdminService],
})
export class AdminModule {}
