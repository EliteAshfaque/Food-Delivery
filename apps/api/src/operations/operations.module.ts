import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.modules';
import { GatewayModule } from '../gateway/gateway.module';
import { OperationsController } from './operations.controller';
import { OperationsService } from './operations.service';

@Module({
  imports: [AuthModule, GatewayModule],
  controllers: [OperationsController],
  providers: [OperationsService],
  exports: [OperationsService],
})
export class OperationsModule {}
