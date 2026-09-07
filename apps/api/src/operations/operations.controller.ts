import {
  Body,
  Controller,
  Get,
  Header,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import type { JwtPayload } from '@food-delivery/types';
import { Request } from '@nestjs/common';
import type { Request as ExpressRequest } from 'express';
import { AdminOnly } from '../admin/decorators/admin-only.decorator';
import {
  AddSupportNoteDto,
  CreateCancellationReasonDto,
  CreateSettlementDto,
  CreateSupportTicketDto,
  ReassignOrderDto,
  ReviewDriverDocumentDto,
  SendNotificationDto,
  UpdateAdminAssignmentDto,
  UpdateSupportTicketDto,
  UpsertDeliveryZoneDto,
  UpsertRestaurantScheduleDto,
} from './dto/operations.dto';
import { OperationsService } from './operations.service';

type AuthRequest = ExpressRequest & { user: JwtPayload };

@Controller('admin/operations')
@AdminOnly()
export class OperationsController {
  constructor(private readonly operations: OperationsService) {}

  @Get('drivers') listDrivers() {
    return this.operations.listDrivers();
  }
  @Get('drivers/:id/documents') listDocuments(
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.operations.listDriverDocuments(id);
  }
  @Patch('driver-documents/:id') reviewDocument(
    @Param('id', ParseUUIDPipe) id: string,
    @Request() req: AuthRequest,
    @Body() dto: ReviewDriverDocumentDto,
  ) {
    return this.operations.reviewDriverDocument(id, req.user.sub, dto);
  }
  @Post('orders/:id/reassign') reassign(
    @Param('id', ParseUUIDPipe) id: string,
    @Request() req: AuthRequest,
    @Body() dto: ReassignOrderDto,
  ) {
    return this.operations.reassignOrder(id, req.user.sub, dto);
  }
  @Get('orders/:id/timeline') timeline(@Param('id', ParseUUIDPipe) id: string) {
    return this.operations.getOrderTimeline(id);
  }

  @Get('delivery-zones') listZones() {
    return this.operations.listZones();
  }
  @Post('delivery-zones') createZone(@Body() dto: UpsertDeliveryZoneDto) {
    return this.operations.createZone(dto);
  }
  @Patch('delivery-zones/:id') updateZone(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpsertDeliveryZoneDto,
  ) {
    return this.operations.updateZone(id, dto);
  }
  @Get('restaurants/:id/schedules') listSchedules(
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.operations.listSchedules(id);
  }
  @Post('restaurants/:id/schedules') upsertSchedule(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpsertRestaurantScheduleDto,
  ) {
    return this.operations.upsertSchedule(id, dto);
  }

  @Get('support-tickets') listTickets() {
    return this.operations.listSupportTickets();
  }
  @Post('support-tickets') createTicket(@Body() dto: CreateSupportTicketDto) {
    return this.operations.createSupportTicket(dto);
  }
  @Patch('support-tickets/:id') updateTicket(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateSupportTicketDto,
  ) {
    return this.operations.updateSupportTicket(id, dto);
  }
  @Post('support-tickets/:id/notes') addNote(
    @Param('id', ParseUUIDPipe) id: string,
    @Request() req: AuthRequest,
    @Body() dto: AddSupportNoteDto,
  ) {
    return this.operations.addSupportNote(id, req.user.sub, dto);
  }

  @Get('cancellation-reasons') listReasons() {
    return this.operations.listCancellationReasons();
  }
  @Post('cancellation-reasons') createReason(
    @Body() dto: CreateCancellationReasonDto,
  ) {
    return this.operations.createCancellationReason(dto);
  }
  @Get('notifications') listNotifications(
    @Query('recipientId') recipientId?: string,
  ) {
    return this.operations.listNotifications(recipientId);
  }
  @Post('notifications') sendNotification(@Body() dto: SendNotificationDto) {
    return this.operations.sendNotification(dto);
  }
  @Post('notifications/:id/retry') retryNotification(
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.operations.retryNotification(id);
  }

  @Get('settlements') listSettlements() {
    return this.operations.listSettlements();
  }
  @Post('settlements') createSettlement(@Body() dto: CreateSettlementDto) {
    return this.operations.createSettlement(dto);
  }
  @Patch('admin-assignments/:id') setAssignment(
    @Param('id', ParseUUIDPipe) id: string,
    @Request() req: AuthRequest,
    @Body() dto: UpdateAdminAssignmentDto,
  ) {
    return this.operations.setAdminAssignment(id, req.user.sub, dto);
  }
  @Get('exports/orders.csv')
  @Header('Content-Type', 'text/csv; charset=utf-8')
  @Header('Content-Disposition', 'attachment; filename="orders-export.csv"')
  exportOrders() {
    return this.operations.exportOrdersCsv();
  }
}
