import {
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Request,
  UseGuards,
} from '@nestjs/common';
import type { JwtPayload } from '@food-delivery/types';
import type { Request as ExpressRequest } from 'express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { NotificationsService } from './notifications.service';

type AuthRequest = ExpressRequest & { user: JwtPayload };

@Controller('notifications')
@UseGuards(JwtAuthGuard)
export class NotificationsController {
  constructor(private readonly notifications: NotificationsService) {}

  @Get('mine')
  listMine(@Request() req: AuthRequest) {
    return this.notifications.listMine(req.user.sub);
  }

  @Patch('read-all')
  markAllRead(@Request() req: AuthRequest) {
    return this.notifications.markAllRead(req.user.sub);
  }

  @Patch(':id/read')
  markRead(
    @Param('id', ParseUUIDPipe) id: string,
    @Request() req: AuthRequest,
  ) {
    return this.notifications.markRead(req.user.sub, id);
  }
}
