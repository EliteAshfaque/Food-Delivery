import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Request,
} from '@nestjs/common';
import type { Request as ExpressRequest } from 'express';
import type { JwtPayload } from '@food-delivery/types';
import { AdminOnly } from './decorators/admin-only.decorator';
import { AdminService } from './admin.service';
import { CreateAdminCategoryDto } from './dto/create-admin-category.dto';
import { CreateAdminMenuItemDto } from './dto/create-admin-menu-item.dto';
import { CreateAdminOfferDto } from './dto/create-admin-offer.dto';
import { CreateAdminRestaurantDto } from './dto/create-admin-restaurant.dto';
import { CreateAdminUserDto } from './dto/create-admin-user.dto';
import { ListOrdersQueryDto } from './dto/list-orders-query.dto';
import { ListAdminOffersQueryDto } from './dto/list-admin-offers-query.dto';
import { ListRestaurantsQueryDto } from './dto/list-restaurants-query.dto';
import { ListUsersQueryDto } from './dto/list-users-query.dto';
import { PaginationQueryDto } from './dto/pagination-query.dto';
import { UpdateAdminCategoryDto } from './dto/update-admin-category.dto';
import { UpdateAdminMenuItemDto } from './dto/update-admin-menu-item.dto';
import { UpdateAdminOrderStatusDto } from './dto/update-admin-order-status.dto';
import { UpdateAdminOfferDto } from './dto/update-admin-offer.dto';
import { UpdateAdminRestaurantDto } from './dto/update-admin-restaurant.dto';
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

  @Post('users')
  createUser(@Request() req: AuthRequest, @Body() dto: CreateAdminUserDto) {
    return this.adminService.createUser(req.user.sub, dto);
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

  @Post('restaurants')
  createRestaurant(
    @Request() req: AuthRequest,
    @Body() dto: CreateAdminRestaurantDto,
  ) {
    return this.adminService.createRestaurant(req.user.sub, dto);
  }

  @Patch('restaurants/:id')
  updateRestaurant(
    @Param('id', ParseUUIDPipe) id: string,
    @Request() req: AuthRequest,
    @Body() dto: UpdateAdminRestaurantDto,
  ) {
    return this.adminService.updateRestaurant(id, req.user.sub, dto);
  }

  @Patch('restaurants/:id/moderation')
  updateRestaurantModeration(
    @Param('id', ParseUUIDPipe) id: string,
    @Request() req: AuthRequest,
    @Body() dto: UpdateRestaurantModerationDto,
  ) {
    return this.adminService.updateRestaurantModeration(id, req.user.sub, dto);
  }

  @Get('restaurants/:id/categories')
  listRestaurantCategories(@Param('id', ParseUUIDPipe) id: string) {
    return this.adminService.listRestaurantCategories(id);
  }

  @Post('restaurants/:id/categories')
  createRestaurantCategory(
    @Param('id', ParseUUIDPipe) id: string,
    @Request() req: AuthRequest,
    @Body() dto: CreateAdminCategoryDto,
  ) {
    return this.adminService.createRestaurantCategory(id, req.user.sub, dto);
  }

  @Patch('restaurants/:id/categories/:categoryId')
  updateRestaurantCategory(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('categoryId', ParseUUIDPipe) categoryId: string,
    @Request() req: AuthRequest,
    @Body() dto: UpdateAdminCategoryDto,
  ) {
    return this.adminService.updateRestaurantCategory(
      id,
      categoryId,
      req.user.sub,
      dto,
    );
  }

  @Delete('restaurants/:id/categories/:categoryId')
  deleteRestaurantCategory(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('categoryId', ParseUUIDPipe) categoryId: string,
    @Request() req: AuthRequest,
  ) {
    return this.adminService.deleteRestaurantCategory(
      id,
      categoryId,
      req.user.sub,
    );
  }

  @Get('restaurants/:id/menu-items')
  listRestaurantMenuItems(@Param('id', ParseUUIDPipe) id: string) {
    return this.adminService.listRestaurantMenuItems(id);
  }

  @Post('restaurants/:id/menu-items')
  createRestaurantMenuItem(
    @Param('id', ParseUUIDPipe) id: string,
    @Request() req: AuthRequest,
    @Body() dto: CreateAdminMenuItemDto,
  ) {
    return this.adminService.createRestaurantMenuItem(id, req.user.sub, dto);
  }

  @Patch('restaurants/:id/menu-items/:itemId')
  updateRestaurantMenuItem(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('itemId', ParseUUIDPipe) itemId: string,
    @Request() req: AuthRequest,
    @Body() dto: UpdateAdminMenuItemDto,
  ) {
    return this.adminService.updateRestaurantMenuItem(
      id,
      itemId,
      req.user.sub,
      dto,
    );
  }

  @Delete('restaurants/:id/menu-items/:itemId')
  deleteRestaurantMenuItem(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('itemId', ParseUUIDPipe) itemId: string,
    @Request() req: AuthRequest,
  ) {
    return this.adminService.deleteRestaurantMenuItem(id, itemId, req.user.sub);
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

  @Post('offers')
  createOffer(@Request() req: AuthRequest, @Body() dto: CreateAdminOfferDto) {
    return this.adminService.createOffer(req.user.sub, dto);
  }

  @Get('offers/:id/redemptions')
  listOfferRedemptions(
    @Param('id', ParseUUIDPipe) id: string,
    @Query() query: PaginationQueryDto,
  ) {
    return this.adminService.listOfferRedemptions(id, query);
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
