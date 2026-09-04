import { Module } from '@nestjs/common';
import { OrdersController } from './oder.controller';
import { OrdersService } from './oder.service';
import { AuthModule } from '../auth/auth.modules';

@Module({
  imports: [AuthModule],
  controllers: [OrdersController],
  providers: [OrdersService],
})
export class OrdersModule {}
