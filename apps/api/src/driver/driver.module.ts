import { Module } from '@nestjs/common';
import { DriverController } from './driver.controller';
import { DriverService } from './driver.service';
import { AuthModule } from '../auth/auth.modules';
import { GatewayModule } from '../gateway/gateway.module';
import { OperationsModule } from '../operations/operations.module';

@Module({
  imports: [AuthModule, GatewayModule, OperationsModule],
  controllers: [DriverController],
  providers: [DriverService],
  exports: [DriverService],
})
export class DriverModule {}
