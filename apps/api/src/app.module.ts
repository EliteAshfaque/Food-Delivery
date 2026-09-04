import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { ConfigModule } from '@nestjs/config';
import { DbModule } from './db/db.module';
import { AuthModule } from './auth/auth.modules';
import { RestaurantsModule } from './restaurent/restaurent.module';
import { MenuModule } from './menu/menu.module';
import { OrdersModule } from './orders/oder.module';
import { PaymentsModule } from './payments/payment.modules';
import { GatewayModule } from './gateway/gateway.module';
import { DriverModule } from './driver/driver.module';
import { LocationModule } from './location/location.module';
import { ReviewsModule } from './reviews/reviews.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),
    DbModule,
    AuthModule,
    RestaurantsModule, 
    MenuModule,
    DriverModule,
    LocationModule,
    OrdersModule,
    PaymentsModule,
    GatewayModule,
    ReviewsModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
