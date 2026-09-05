import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  ParseUUIDPipe,
  Post,
  Request,
  UseGuards,
} from '@nestjs/common';
import type { Request as ExpressRequest } from 'express';
import { UserRole, type JwtPayload } from '@food-delivery/types';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { Roles } from '../auth/decorators/role.decorator';
import { RolesGuard } from '../auth/guards/roles.guard';
import { ChangeOfferStatusDto } from './dto/change-offer-status.dto';
import { CreateOfferDto } from './dto/create-offer.dto';
import { UpdateOfferDto } from './dto/update-offer.dto';
import { ValidateOfferDto } from './dto/validate-offer.dto';
import { OffersService } from './offers.service';

type AuthRequest = ExpressRequest & { user: JwtPayload };

@Controller('offers')
@UseGuards(JwtAuthGuard)
export class OffersController {
  constructor(private readonly offersService: OffersService) {}

  @Get('hot')
  findHotOffers() {
    return this.offersService.findHotOffers();
  }

  @Get('restaurant/:restaurantId')
  findByRestaurant(
    @Param('restaurantId', new ParseUUIDPipe()) restaurantId: string,
  ) {
    return this.offersService.findByRestaurant(restaurantId);
  }

  @Post('validate')
  @UseGuards(RolesGuard)
  @Roles(UserRole.CUSTOMER)
  validate(@Request() req: AuthRequest, @Body() dto: ValidateOfferDto) {
    return this.offersService.validateForCheckout(
      req.user.sub,
      dto.restaurantId,
      dto.subtotalAmount,
      dto.code,
    );
  }

  @Post()
  @UseGuards(RolesGuard)
  @Roles(UserRole.RESTAURANT_OWNER)
  create(@Request() req: AuthRequest, @Body() dto: CreateOfferDto) {
    return this.offersService.create(req.user.sub, dto);
  }

  @Get('mine')
  @UseGuards(RolesGuard)
  @Roles(UserRole.RESTAURANT_OWNER)
  findMine(@Request() req: AuthRequest) {
    return this.offersService.findMine(req.user.sub);
  }

  @Patch(':id')
  @UseGuards(RolesGuard)
  @Roles(UserRole.RESTAURANT_OWNER)
  update(
    @Request() req: AuthRequest,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: UpdateOfferDto,
  ) {
    return this.offersService.update(req.user.sub, id, dto);
  }

  @Patch(':id/status')
  @UseGuards(RolesGuard)
  @Roles(UserRole.RESTAURANT_OWNER)
  changeStatus(
    @Request() req: AuthRequest,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: ChangeOfferStatusDto,
  ) {
    return this.offersService.changeStatus(req.user.sub, id, dto.status);
  }
}
