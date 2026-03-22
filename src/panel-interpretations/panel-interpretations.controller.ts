import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  UseGuards,
  Req,
} from '@nestjs/common';
import type { Request as ExpressRequest } from 'express';
import { PanelInterpretationsService } from './panel-interpretations.service';
import { CreatePanelInterpretationDto } from './dto/create-panel-interpretation.dto';
import { UpdatePanelInterpretationDto } from './dto/update-panel-interpretation.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { UserRoleEnum } from '../database/schemas/user-role.schema';

type AuthenticatedRequest = ExpressRequest & {
  user: {
    userId: string;
  };
};

@Controller('panel-interpretations')
@UseGuards(JwtAuthGuard, RolesGuard)
export class PanelInterpretationsController {
  constructor(
    private readonly panelInterpretationsService: PanelInterpretationsService,
  ) {}

  /**
   * Create or update panel interpretation
   * POST /panel-interpretations
   */
  @Post()
  @Roles(UserRoleEnum.ADMIN, UserRoleEnum.LAB_TECH)
  async upsert(
    @Body() createDto: CreatePanelInterpretationDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.panelInterpretationsService.upsert(createDto, req.user.userId);
  }

  /**
   * Get all interpretations for an order
   * GET /panel-interpretations/order/:orderId
   */
  @Get('order/:orderId')
  @Roles(UserRoleEnum.ADMIN, UserRoleEnum.LAB_TECH, UserRoleEnum.RECEPTIONIST)
  async findByOrder(@Param('orderId') orderId: string) {
    return this.panelInterpretationsService.findByOrder(orderId);
  }

  /**
   * Get interpretation for a specific panel
   * GET /panel-interpretations/order/:orderId/panel/:panelCode
   */
  @Get('order/:orderId/panel/:panelCode')
  @Roles(UserRoleEnum.ADMIN, UserRoleEnum.LAB_TECH, UserRoleEnum.RECEPTIONIST)
  async findOne(
    @Param('orderId') orderId: string,
    @Param('panelCode') panelCode: string,
  ) {
    return this.panelInterpretationsService.findOne(orderId, panelCode);
  }

  /**
   * Update panel interpretation
   * PUT /panel-interpretations/order/:orderId/panel/:panelCode
   */
  @Put('order/:orderId/panel/:panelCode')
  @Roles(UserRoleEnum.ADMIN, UserRoleEnum.LAB_TECH)
  async update(
    @Param('orderId') orderId: string,
    @Param('panelCode') panelCode: string,
    @Body() updateDto: UpdatePanelInterpretationDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.panelInterpretationsService.update(
      orderId,
      panelCode,
      updateDto,
      req.user.userId,
    );
  }

  /**
   * Delete panel interpretation
   * DELETE /panel-interpretations/order/:orderId/panel/:panelCode
   */
  @Delete('order/:orderId/panel/:panelCode')
  @Roles(UserRoleEnum.ADMIN, UserRoleEnum.LAB_TECH)
  async remove(
    @Param('orderId') orderId: string,
    @Param('panelCode') panelCode: string,
  ) {
    return this.panelInterpretationsService.remove(orderId, panelCode);
  }
}
