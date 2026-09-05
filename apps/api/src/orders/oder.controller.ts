import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Request,
  UseGuards,
} from '@nestjs/common';
import type { Request as ExpressRequest } from 'express';
import { OrdersService } from './oder.service';
import { CreateOrderDto } from './dto/create-oder.dto';
import { UpdateOrderStatusDto } from './dto/update-order-status.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/role.decorator';
import { UserRole, type JwtPayload } from '@food-delivery/types';

type AuthRequest = ExpressRequest & { user: JwtPayload };

@Controller('orders')
@UseGuards(JwtAuthGuard)
export class OrdersController {
  constructor(private ordersService: OrdersService) {}

  @Post()
  @UseGuards(RolesGuard)
  @Roles(UserRole.CUSTOMER)
  create(@Request() req: AuthRequest, @Body() dto: CreateOrderDto) {
    return this.ordersService.create(req.user.sub, dto);
  }

  @Get('mine')
  @UseGuards(RolesGuard)
  @Roles(UserRole.CUSTOMER, UserRole.DRIVER)
  findMine(@Request() req: AuthRequest) {
    return this.ordersService.findMyOrders(req.user.sub, req.user.role);
  }

  @Get('restaurant')
  @UseGuards(RolesGuard)
  @Roles(UserRole.RESTAURANT_OWNER)
  findByOwner(@Request() req: AuthRequest) {
    return this.ordersService.findByOwner(req.user.sub);
  }

  @Get('restaurant/:restaurantId')
  @UseGuards(RolesGuard)
  @Roles(UserRole.RESTAURANT_OWNER)
  findByRestaurant(
    @Param('restaurantId') restaurantId: string,
    @Request() req: AuthRequest,
  ) {
    return this.ordersService.findByRestaurant(restaurantId, req.user.sub);
  }

  @Get('driver-availability')
  @UseGuards(RolesGuard)
  @Roles(UserRole.RESTAURANT_OWNER)
  getDriverAvailability() {
    return this.ordersService.getDriverAvailability();
  }

  @Patch(':id/status')
  @UseGuards(RolesGuard)
  @Roles(UserRole.RESTAURANT_OWNER, UserRole.DRIVER)
  updateStatus(
    @Param('id') id: string,
    @Body() dto: UpdateOrderStatusDto,
    @Request() req: AuthRequest,
  ) {
    return this.ordersService.updateStatus(id, dto.status, req.user);
  }

  @Get(':id')
  findOne(@Param('id') id: string, @Request() req: AuthRequest) {
    return this.ordersService.findById(id, req.user);
  }
}
