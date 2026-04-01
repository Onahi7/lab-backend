import {
  Controller,
  Delete,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Query,
  UseGuards,
  Request,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { OrdersService } from './orders.service';
import { CreateOrderDto } from './dto/create-order.dto';
import { UpdateOrderDto } from './dto/update-order.dto';
import { CancelOrderDto } from './dto/cancel-order.dto';
import { AddPaymentDto } from './dto/add-payment.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { UserRoleEnum } from '../database/schemas/user-role.schema';

@Controller('orders')
@UseGuards(JwtAuthGuard, RolesGuard)
export class OrdersController {
  constructor(private readonly ordersService: OrdersService) {}

  @Post()
  @Roles(UserRoleEnum.ADMIN, UserRoleEnum.RECEPTIONIST)
  async create(@Body() createOrderDto: CreateOrderDto, @Request() req: any) {
    return this.ordersService.create(createOrderDto, req.user?.userId);
  }

  @Get()
  @Roles(UserRoleEnum.ADMIN, UserRoleEnum.LAB_TECH, UserRoleEnum.RECEPTIONIST)
  async findAll(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('status') status?: string,
    @Query('patientId') patientId?: string,
    @Query('search') search?: string,
  ) {
    const pageNum = page ? parseInt(page, 10) : 1;
    const limitNum = limit ? parseInt(limit, 10) : 10;
    return this.ordersService.findAll(pageNum, limitNum, status, patientId, search);
  }

  @Get('pending-collection')
  @Roles(UserRoleEnum.ADMIN, UserRoleEnum.LAB_TECH, UserRoleEnum.RECEPTIONIST)
  async getPendingCollection() {
    return this.ordersService.getPendingCollection();
  }

  @Get('pending-results')
  @Roles(UserRoleEnum.ADMIN, UserRoleEnum.LAB_TECH, UserRoleEnum.RECEPTIONIST)
  async getPendingResults() {
    return this.ordersService.getPendingResults();
  }

  @Get('stats/payment')
  @Roles(UserRoleEnum.ADMIN, UserRoleEnum.RECEPTIONIST)
  async getPaymentStats(
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    return this.ordersService.getPaymentStats(startDate, endDate);
  }

  @Get('stats/daily-income')
  @Roles(UserRoleEnum.ADMIN, UserRoleEnum.RECEPTIONIST)
  async getDailyIncome(
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    return this.ordersService.getDailyIncome(startDate, endDate);
  }

  @Get('stats/outstanding')
  @Roles(UserRoleEnum.ADMIN, UserRoleEnum.RECEPTIONIST)
  async getOutstandingBalances() {
    return this.ordersService.getOutstandingBalances();
  }

  @Get(':id')
  @Roles(UserRoleEnum.ADMIN, UserRoleEnum.LAB_TECH, UserRoleEnum.RECEPTIONIST)
  async findOne(@Param('id') id: string) {
    return this.ordersService.findOne(id);
  }

  @Get(':id/tests')
  @Roles(UserRoleEnum.ADMIN, UserRoleEnum.LAB_TECH, UserRoleEnum.RECEPTIONIST)
  async getOrderTests(@Param('id') id: string) {
    return this.ordersService.getOrderTests(id);
  }

  @Patch(':id')
  @Roles(UserRoleEnum.ADMIN, UserRoleEnum.RECEPTIONIST, UserRoleEnum.LAB_TECH)
  async update(
    @Param('id') id: string,
    @Body() updateOrderDto: UpdateOrderDto,
  ) {
    return this.ordersService.update(id, updateOrderDto);
  }

  @Post(':id/cancel')
  @Roles(UserRoleEnum.ADMIN, UserRoleEnum.RECEPTIONIST)
  async cancel(
    @Param('id') id: string,
    @Body() cancelOrderDto: CancelOrderDto,
    @Request() req: any,
  ) {
    return this.ordersService.cancel(id, cancelOrderDto, req.user?.userId);
  }

  @Post(':id/collect')
  @Roles(UserRoleEnum.ADMIN, UserRoleEnum.LAB_TECH, UserRoleEnum.RECEPTIONIST)
  async collect(@Param('id') id: string, @Request() req: any) {
    return this.ordersService.collect(id, req.user?.userId);
  }

  @Post(':id/payment')
  @HttpCode(HttpStatus.CREATED)
  @Roles(UserRoleEnum.ADMIN, UserRoleEnum.RECEPTIONIST)
  async addPayment(
    @Param('id') id: string,
    @Body() addPaymentDto: AddPaymentDto,
    @Request() req: any,
  ) {
    return this.ordersService.addPayment(id, addPaymentDto, req.user?.userId);
  }

  @Get(':id/payments')
  @Roles(UserRoleEnum.ADMIN, UserRoleEnum.LAB_TECH, UserRoleEnum.RECEPTIONIST)
  async getPaymentHistory(@Param('id') id: string) {
    return this.ordersService.getPaymentHistory(id);
  }

  @Delete(':id')
  @Roles(UserRoleEnum.ADMIN)
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@Param('id') id: string) {
    return this.ordersService.remove(id);
  }
}
