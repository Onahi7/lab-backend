import { Controller, Get, Post, Body, Param, Query, UseGuards } from '@nestjs/common';
import { PharmacyService } from './pharmacy.service';
import { CheckoutDto } from './dto/checkout.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { UserRoleEnum } from '../database/schemas/user-role.schema';

@Controller('pharmacy')
@UseGuards(JwtAuthGuard, RolesGuard)
export class PharmacyController {
  constructor(private readonly pharmacyService: PharmacyService) {}

  @Get('products')
  @Roles(UserRoleEnum.ADMIN, UserRoleEnum.LAB_TECH, UserRoleEnum.RECEPTIONIST)
  async getProducts(
    @Query('search') search?: string,
    @Query('category') category?: string,
  ) {
    const products = await this.pharmacyService.getProducts(search, category);
    return { success: true, data: products };
  }

  @Get('products/barcode/:barcode')
  @Roles(UserRoleEnum.ADMIN, UserRoleEnum.LAB_TECH, UserRoleEnum.RECEPTIONIST)
  async getProductByBarcode(@Param('barcode') barcode: string) {
    const product = await this.pharmacyService.getProductByBarcode(barcode);
    return { success: true, data: product };
  }

  @Get('low-stock')
  @Roles(UserRoleEnum.ADMIN, UserRoleEnum.LAB_TECH, UserRoleEnum.RECEPTIONIST)
  async getLowStock() {
    const alerts = await this.pharmacyService.getLowStockAlerts();
    return { success: true, data: alerts };
  }

  @Get('stock/:productId')
  @Roles(UserRoleEnum.ADMIN, UserRoleEnum.LAB_TECH, UserRoleEnum.RECEPTIONIST)
  async getProductStock(@Param('productId') productId: string) {
    const stock = await this.pharmacyService.getProductStock(productId);
    return { success: true, data: { productId, quantityAvailable: stock } };
  }

  @Post('checkout')
  @Roles(UserRoleEnum.ADMIN, UserRoleEnum.LAB_TECH, UserRoleEnum.RECEPTIONIST)
  async checkout(@Body() dto: CheckoutDto) {
    const result = await this.pharmacyService.checkout({
      items: dto.items,
      paymentMethod: dto.paymentMethod,
      customerName: dto.customerName,
      customerPhone: dto.customerPhone,
      notes: dto.notes,
      discount: dto.discount,
      idempotencyKey: dto.idempotencyKey,
    });
    return { success: true, data: result };
  }

  @Get('sales')
  @Roles(UserRoleEnum.ADMIN, UserRoleEnum.LAB_TECH, UserRoleEnum.RECEPTIONIST)
  async getSales(
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    const sales = await this.pharmacyService.getSales(undefined, startDate, endDate);
    return { success: true, data: sales };
  }
}
