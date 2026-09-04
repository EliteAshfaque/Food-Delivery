import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Request,
  UseGuards,
} from '@nestjs/common';
import { RestaurantsService } from './restaurent-service';
import { CreateRestaurantDto } from './dto/create-restaurent.dto';
import { UpdateRestaurantDto } from './dto/update-restaurent.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/role.decorator';
import { UserRole, type JwtPayload } from '@food-delivery/types';
import type { Request as ExpressRequest } from 'express';
type AuthRequest = ExpressRequest & { user: JwtPayload };

@Controller('restaurants')
@UseGuards(JwtAuthGuard)
export class RestaurantsController {
    constructor(private restaurantsService: RestaurantsService) {}

    @Post()
    @UseGuards(RolesGuard)
    @Roles(UserRole.RESTAURANT_OWNER)
    create(@Request() req: AuthRequest, @Body() dto: CreateRestaurantDto) {
        return this.restaurantsService.create(req.user.sub, dto);
    }

    @Get('mine')
    @UseGuards(RolesGuard)
    @Roles(UserRole.RESTAURANT_OWNER)
    findMine(@Request() req: AuthRequest) {
        return this.restaurantsService.findMine(req.user.sub);
    }

    @Get()
    findAll(@Query('search') search?: string) {
        return this.restaurantsService.findAll(search);
    }

    @Get(':id')
    findOne(@Param('id') id: string) {
        return this.restaurantsService.findById(id);
    }

    @Patch(':id')
    @UseGuards(RolesGuard)
    @Roles(UserRole.RESTAURANT_OWNER)
    update(
        @Param('id') id: string,
        @Request() req: AuthRequest,
        @Body() dto: UpdateRestaurantDto,
    ) {
        return this.restaurantsService.update(id, req.user.sub, dto);
    }
}