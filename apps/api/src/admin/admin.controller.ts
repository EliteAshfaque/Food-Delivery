import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Query,
  Request,
} from '@nestjs/common';
import type { Request as ExpressRequest } from 'express';
import type { JwtPayload } from '@food-delivery/types';
import { AdminOnly } from './decorators/admin-only.decorator';
import { AdminService } from './admin.service';
import { ListOrdersQueryDto } from './dto/list-orders-query.dto';
import { ListAdminOffersQueryDto } from './dto/list-admin-offers-query.dto';
import { ListRestaurantsQueryDto } from './dto/list-restaurants-query.dto';
import { ListUsersQueryDto } from './dto/list-users-query.dto';
import { PaginationQueryDto } from './dto/pagination-query.dto';
import { UpdateAdminOrderStatusDto } from './dto/update-admin-order-status.dto';
import { UpdateAdminOfferDto } from './dto/update-admin-offer.dto';
import { UpdateAdminUserDto } from './dto/update-admin-user.dto';
import { UpdateRestaurantModerationDto } from './dto/update-restaurant-moderation.dto';

type AuthRequest = ExpressRequest & { user: JwtPayload };

/**
 * A separate, privileged API surface for operations staff. Every endpoint is
 * protected by AdminOnly, which also checks that the account remains active.
 */
@Controller('admin')
@AdminOnly()
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

  @Get('dashboard')
  getDashboard() {
    return this.adminService.getDashboard();
  }

  @Get('users')
  listUsers(@Query() query: ListUsersQueryDto) {
    return this.adminService.listUsers(query);
  }

  @Patch('users/:id')
  updateUser(
    @Param('id', ParseUUIDPipe) id: string,
    @Request() req: AuthRequest,
    @Body() dto: UpdateAdminUserDto,
  ) {
    return this.adminService.updateUser(id, req.user.sub, dto);
  }

  @Get('restaurants')
  listRestaurants(@Query() query: ListRestaurantsQueryDto) {
    return this.adminService.listRestaurants(query);
  }

  @Patch('restaurants/:id/moderation')
  updateRestaurantModeration(
    @Param('id', ParseUUIDPipe) id: string,
    @Request() req: AuthRequest,
    @Body() dto: UpdateRestaurantModerationDto,
  ) {
    return this.adminService.updateRestaurantModeration(id, req.user.sub, dto);
  }

  @Get('orders')
  listOrders(@Query() query: ListOrdersQueryDto) {
    return this.adminService.listOrders(query);
  }

  @Patch('orders/:id/status')
  cancelOrder(
    @Param('id', ParseUUIDPipe) id: string,
    @Request() req: AuthRequest,
    @Body() dto: UpdateAdminOrderStatusDto,
  ) {
    return this.adminService.cancelOrder(id, req.user.sub, dto);
  }

  @Get('offers')
  listOffers(@Query() query: ListAdminOffersQueryDto) {
    return this.adminService.listOffers(query);
  }

  @Patch('offers/:id')
  updateOffer(
    @Param('id', ParseUUIDPipe) id: string,
    @Request() req: AuthRequest,
    @Body() dto: UpdateAdminOfferDto,
  ) {
    return this.adminService.updateOffer(id, req.user.sub, dto);
  }

  @Get('audit-logs')
  listAuditLogs(@Query() query: PaginationQueryDto) {
    return this.adminService.listAuditLogs(query);
  }
}
