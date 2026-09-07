import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Request,
  UseGuards,
} from '@nestjs/common';
import type { JwtPayload } from '@food-delivery/types';
import type { Request as ExpressRequest } from 'express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { Roles } from '../auth/decorators/role.decorator';
import { RolesGuard } from '../auth/guards/roles.guard';
import { UserRole } from '@food-delivery/types';
import {
  ClaimReferralDto,
  CreateFavoriteDto,
  ReorderDto,
  SavePaymentMethodDto,
} from './dto/engagement.dto';
import { EngagementService } from './engagement.service';

type AuthRequest = ExpressRequest & { user: JwtPayload };

@Controller('engagement')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.CUSTOMER)
export class EngagementController {
  constructor(private readonly engagement: EngagementService) {}

  @Get('favorites') favorites(@Request() req: AuthRequest) {
    return this.engagement.listFavorites(req.user.sub);
  }
  @Post('favorites') addFavorite(
    @Request() req: AuthRequest,
    @Body() dto: CreateFavoriteDto,
  ) {
    return this.engagement.addFavorite(req.user.sub, dto.restaurantId);
  }
  @Delete('favorites/:restaurantId') removeFavorite(
    @Request() req: AuthRequest,
    @Param('restaurantId', ParseUUIDPipe) restaurantId: string,
  ) {
    return this.engagement.removeFavorite(req.user.sub, restaurantId);
  }
  @Post('orders/:id/reorder') reorder(
    @Request() req: AuthRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ReorderDto,
  ) {
    return this.engagement.reorder(req.user.sub, id, dto.deliveryAddress);
  }
  @Get('loyalty') loyalty(@Request() req: AuthRequest) {
    return this.engagement.loyalty(req.user.sub);
  }
  @Post('referrals/claim') claimReferral(
    @Request() req: AuthRequest,
    @Body() dto: ClaimReferralDto,
  ) {
    return this.engagement.claimReferral(req.user.sub, dto.referralCode);
  }
  @Get('payment-methods') paymentMethods(@Request() req: AuthRequest) {
    return this.engagement.paymentMethods(req.user.sub);
  }
  @Post('payment-methods/setup') paymentSetup(@Request() req: AuthRequest) {
    return this.engagement.createPaymentSetup(req.user.sub);
  }
  @Post('payment-methods') savePaymentMethod(
    @Request() req: AuthRequest,
    @Body() dto: SavePaymentMethodDto,
  ) {
    return this.engagement.savePaymentMethod(
      req.user.sub,
      dto.paymentMethodId,
      dto.stripeCustomerId,
      dto.isDefault,
    );
  }
  @Delete('payment-methods/:id') removePaymentMethod(
    @Request() req: AuthRequest,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.engagement.removePaymentMethod(req.user.sub, id);
  }
}
