import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Request,
  UseGuards,
} from '@nestjs/common';
import type { Request as ExpressRequest } from 'express';
import { ReviewsService } from './reviews.service';
import { CreateReviewDto } from './dto/create-review.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/role.decorator';
import { UserRole, type JwtPayload } from '@food-delivery/types';

type AuthRequest = ExpressRequest & { user: JwtPayload };

@Controller('reviews')
@UseGuards(JwtAuthGuard)
export class ReviewsController {
  constructor(private reviewsService: ReviewsService) {}

  @Post()
  @UseGuards(RolesGuard)
  @Roles(UserRole.CUSTOMER)
  create(@Request() req: AuthRequest, @Body() dto: CreateReviewDto) {
    return this.reviewsService.create(req.user.sub, dto);
  }

  @Get('order/:orderId')
  @UseGuards(RolesGuard)
  @Roles(UserRole.CUSTOMER)
  findByOrder(
    @Param('orderId', ParseUUIDPipe) orderId: string,
    @Request() req: AuthRequest,
  ) {
    return this.reviewsService.findByOrder(orderId, req.user.sub);
  }

  @Get('restaurant/:restaurantId')
  findByRestaurant(@Param('restaurantId', ParseUUIDPipe) restaurantId: string) {
    return this.reviewsService.findByRestaurant(restaurantId);
  }

  @Get('driver/:driverId')
  getDriverRating(@Param('driverId', ParseUUIDPipe) driverId: string) {
    return this.reviewsService.getDriverRating(driverId);
  }

  @Get('driver/:driverId/list')
  findByDriver(@Param('driverId', ParseUUIDPipe) driverId: string) {
    return this.reviewsService.findByDriver(driverId);
  }
}
