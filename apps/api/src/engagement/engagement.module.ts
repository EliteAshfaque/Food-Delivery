import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.modules';
import { OrdersModule } from '../orders/oder.module';
import { PaymentsModule } from '../payments/payment.modules';
import { EngagementController } from './engagement.controller';
import { EngagementService } from './engagement.service';

@Module({
  imports: [AuthModule, OrdersModule, PaymentsModule],
  controllers: [EngagementController],
  providers: [EngagementService],
})
export class EngagementModule {}
