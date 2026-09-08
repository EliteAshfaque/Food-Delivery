import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.modules';
import { GatewayModule } from '../gateway/gateway.module';
import { OperationsController } from './operations.controller';
import { FcmPushService } from './fcm-push.service';
import { OperationsService } from './operations.service';

@Module({
  imports: [AuthModule, GatewayModule],
  controllers: [OperationsController],
  providers: [OperationsService, FcmPushService],
  exports: [OperationsService],
})
export class OperationsModule {}
