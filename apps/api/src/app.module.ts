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
import { AdminModule } from './admin/admin.module';
import { OffersModule } from './offers/offers.module';
import { UploadthingModule } from './uploadthing/uploadthing.module';
import { ThrottlerModule } from '@nestjs/throttler';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),
    // Applied to the authentication controller with a tighter route-level
    // override, without throttling order tracking or Stripe webhooks.
    ThrottlerModule.forRoot([
      {
        ttl: 60_000,
        limit: 60,
      },
    ]),
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
    AdminModule,
    OffersModule,
    UploadthingModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
