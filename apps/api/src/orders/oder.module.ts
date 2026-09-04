import { Module, forwardRef } from '@nestjs/common';
import { OrdersController } from './oder.controller';
import { OrdersService } from './oder.service';
import { AuthModule } from '../auth/auth.modules';
import { GatewayModule } from '../gateway/gateway.module';
import { DriverModule } from '../driver/driver.module';

@Module({
  imports: [AuthModule, GatewayModule, forwardRef(() => DriverModule)],
  controllers: [OrdersController],
  providers: [OrdersService],
})
export class OrdersModule {}
