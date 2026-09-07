import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Request,
  UseGuards,
} from '@nestjs/common';
import type { Request as ExpressRequest } from 'express';
import { UserRole, type JwtPayload } from '@food-delivery/types';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/role.decorator';
import { AddressesService } from './addresses.service';
import { CreateAddressDto } from './dto/create-address.dto';
import { UpdateAddressDto } from './dto/update-address.dto';

type AuthRequest = ExpressRequest & { user: JwtPayload };

@Controller('addresses')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.CUSTOMER)
export class AddressesController {
  constructor(private readonly addressesService: AddressesService) {}

  @Get()
  list(@Request() req: AuthRequest) {
    return this.addressesService.list(req.user.sub);
  }

  @Post()
  create(@Request() req: AuthRequest, @Body() dto: CreateAddressDto) {
    return this.addressesService.create(req.user.sub, dto);
  }

  @Patch(':id')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Request() req: AuthRequest,
    @Body() dto: UpdateAddressDto,
  ) {
    return this.addressesService.update(req.user.sub, id, dto);
  }

  @Patch(':id/default')
  setDefault(
    @Param('id', ParseUUIDPipe) id: string,
    @Request() req: AuthRequest,
  ) {
    return this.addressesService.setDefault(req.user.sub, id);
  }

  @Delete(':id')
  remove(
    @Param('id', ParseUUIDPipe) id: string,
    @Request() req: AuthRequest,
  ) {
    return this.addressesService.remove(req.user.sub, id);
  }
}
