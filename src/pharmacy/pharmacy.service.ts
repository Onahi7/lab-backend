import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HttpService } from '@nestjs/axios';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { firstValueFrom } from 'rxjs';
import { Payment } from '../database/schemas/payment.schema';

interface CafAuthResponse {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

export interface CafProduct {
  _id: string;
  name: string;
  sku: string;
  barcode: string;
  category: string;
  brand: string;
  unit: string;
  quantityAvailable: number;
  reorderLevel: number;
  basePrice: number;
  suggestedRetailPrice: number;
  requiresPrescription: boolean;
  isActive: boolean;
}

@Injectable()
export class PharmacyService {
  private readonly logger = new Logger(PharmacyService.name);
  private accessToken: string | null = null;
  private tokenExpiresAt: Date | null = null;
  private cafUserId: string | null = null;

  constructor(
    private readonly configService: ConfigService,
    private readonly httpService: HttpService,
    @InjectModel(Payment.name) private paymentModel: Model<Payment>,
  ) {}

  private get baseUrl(): string {
    return this.configService.get<string>('caf.baseUrl', '');
  }

  private get username(): string {
    return this.configService.get<string>('caf.username', '');
  }

  private get password(): string {
    return this.configService.get<string>('caf.password', '');
  }

  private get branchId(): string {
    return this.configService.get<string>('caf.branchId', '');
  }

  isConfigured(): boolean {
    return !!(this.baseUrl && this.username && this.password && this.branchId);
  }

  private get headers() {
    return {
      Authorization: `Bearer ${this.accessToken}`,
      'Content-Type': 'application/json',
    };
  }

  private idempotencyKey(prefix: string): string {
    return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  }

  private decodeJwt(token: string): { sub?: string } | null {
    try {
      const parts = token.split('.');
      if (parts.length !== 3) return null;
      return JSON.parse(Buffer.from(parts[1], 'base64').toString('utf-8'));
    } catch {
      return null;
    }
  }

  private async ensureAuthenticated(): Promise<string> {
    if (this.accessToken && this.tokenExpiresAt && new Date() < this.tokenExpiresAt) {
      return this.accessToken;
    }

    const { data } = await firstValueFrom(
      this.httpService.post<CafAuthResponse>(`${this.baseUrl}/auth/login`, {
        username: this.username,
        password: this.password,
      }),
    );

    this.accessToken = data.accessToken;
    this.tokenExpiresAt = new Date(Date.now() + data.expiresIn * 1000);

    const payload = this.decodeJwt(data.accessToken);
    this.cafUserId = payload?.sub || null;

    return this.accessToken;
  }

  async getProducts(search?: string, category?: string): Promise<CafProduct[]> {
    if (!this.isConfigured()) return [];
    try {
      await this.ensureAuthenticated();

      const params: any = { branchId: this.branchId };
      if (search) params.query = search;
      if (category) params.category = category;

      const { data } = await firstValueFrom(
        this.httpService.get(`${this.baseUrl}/products/search`, {
          headers: this.headers,
          params,
        }),
      );
      return data.data || data;
    } catch (error: any) {
      this.logger.error(`CAF products fetch failed: ${error.message}`);
      return [];
    }
  }

  async getProductByBarcode(barcode: string): Promise<CafProduct | null> {
    if (!this.isConfigured()) return null;
    await this.ensureAuthenticated();

    try {
      const { data } = await firstValueFrom(
        this.httpService.get(`${this.baseUrl}/products/barcode/${barcode}`, {
          headers: this.headers,
        }),
      );
      return data.data || data;
    } catch {
      return null;
    }
  }

  async getLowStockAlerts(): Promise<any[]> {
    if (!this.isConfigured()) return [];
    try {
      await this.ensureAuthenticated();

      const { data } = await firstValueFrom(
        this.httpService.get(`${this.baseUrl}/inventory/low-stock-alerts`, {
          headers: this.headers,
          params: { branchId: this.branchId },
        }),
      );
      return data.data || [];
    } catch (error: any) {
      this.logger.error(`CAF low stock fetch failed: ${error.message}`);
      return [];
    }
  }

  async getProductStock(productId: string): Promise<number> {
    if (!this.isConfigured()) return 0;
    await this.ensureAuthenticated();

    const productRes = await firstValueFrom(
      this.httpService.get(`${this.baseUrl}/products/${productId}`, {
        headers: this.headers,
      }),
    );
    const productStock =
      productRes?.data?.data?.quantityAvailable ?? productRes?.data?.quantityAvailable;
    if (typeof productStock === 'number') {
      return productStock;
    }

    const { data } = await firstValueFrom(
      this.httpService.get(`${this.baseUrl}/inventory/product-stock`, {
        headers: this.headers,
        params: { branchId: this.branchId, productId },
      }),
    );
    return data?.data?.calculatedStock ?? data?.data?.quantityAvailable ?? 0;
  }

  private async ensureOpenShift(): Promise<string> {
    await this.ensureAuthenticated();

    const currentRes = await firstValueFrom(
      this.httpService.get(`${this.baseUrl}/shifts/current`, {
        headers: this.headers,
        params: { branchId: this.branchId, cashierId: this.cafUserId, terminalId: 'lab-dispensary' },
      }),
    ).catch(() => ({ data: null }));

    const currentShift = currentRes?.data?.data;
    if (currentShift?._id) {
      return currentShift._id;
    }

    const openRes = await firstValueFrom(
      this.httpService.post(
        `${this.baseUrl}/shifts/open`,
        { branchId: this.branchId, cashierId: this.cafUserId, terminalId: 'lab-dispensary', openingCash: 0 },
        {
          headers: {
            ...this.headers,
            'X-Idempotency-Key': this.idempotencyKey('lab-shift-open'),
          },
        },
      ),
    );

    const shiftId = openRes?.data?.data?._id;
    if (!shiftId) {
      throw new BadRequestException('Failed to open CAF shift');
    }
    this.logger.log(`Opened CAF shift ${shiftId} for lab dispensary`);
    return shiftId;
  }

  async checkout(params: {
    items: Array<{ productId: string; quantity: number; unitPrice: number; packSize?: { code?: string; name: string; unit: string; quantityPerPack: number } }>;
    paymentMethod: string;
    customerName?: string;
    customerPhone?: string;
    notes?: string;
    discount?: number;
    idempotencyKey?: string;
  }): Promise<{ saleId: string; receiptNumber: string; total: number }> {
    if (!this.isConfigured()) {
      throw new BadRequestException('CAF integration not configured');
    }

    try {
      const shiftId = await this.ensureOpenShift();

      const checkoutItems = params.items.map((item) => ({
        productId: item.productId,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        ...(item.packSize ? { packSize: item.packSize } : {}),
      }));

      const { data } = await firstValueFrom(
        this.httpService.post(
          `${this.baseUrl}/sales/checkout`,
          {
            branchId: this.branchId,
            shiftId,
            terminalId: 'lab-dispensary',
            items: checkoutItems,
            paymentMethod: params.paymentMethod,
            customerName: params.customerName || 'Lab Customer',
            customerPhone: params.customerPhone,
            notes: params.notes || 'Lab dispensary sale',
            discount: params.discount || 0,
          },
          {
            headers: {
              ...this.headers,
              'X-Idempotency-Key': params.idempotencyKey || this.idempotencyKey('lab-checkout'),
            },
          },
        ),
      );

      const saleId = data.data.saleId;
      const receiptNumber = data.data.receiptNumber;
      const total = data.data.total;

      // Record a local Payment so reconciliation picks it up
      try {
        const totalAmount = params.items.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0);
        const finalAmount = params.discount ? totalAmount - params.discount : totalAmount;

        await this.paymentModel.create({
          amount: finalAmount,
          paymentMethod: params.paymentMethod,
          notes: `Pharmacy sale ${receiptNumber}${params.customerName ? ` - ${params.customerName}` : ''}`,
          source: 'pharmacy',
          cafSaleId: saleId,
          cafReceiptNumber: receiptNumber,
        });
      } catch (err: any) {
        this.logger.error(`Failed to record local payment for pharmacy sale: ${err.message}`);
      }

      return {
        saleId,
        receiptNumber,
        total,
      };
    } catch (error: any) {
      const message = error?.response?.data?.message || error?.message || 'Pharmacy checkout failed';
      this.logger.error(`Pharmacy checkout error: ${message}`);
      throw new BadRequestException(`Checkout failed: ${message}`);
    }
  }

  async getSales(branchId?: string, startDate?: string, endDate?: string): Promise<any[]> {
    try {
      const filter: any = { source: 'pharmacy' };
      if (startDate || endDate) {
        filter.createdAt = {};
        if (startDate) filter.createdAt.$gte = new Date(startDate);
        if (endDate) filter.createdAt.$lte = new Date(endDate);
      }

      const payments = await this.paymentModel
        .find(filter)
        .sort({ createdAt: -1 })
        .limit(50)
        .lean()
        .exec();

      return payments.map((p: any) => ({
        _id: p._id,
        receiptNumber: p.cafReceiptNumber || p._id.toString().slice(-8).toUpperCase(),
        total: p.amount,
        paymentMethod: p.paymentMethod || 'cash',
        customerName: p.notes?.includes('-')
          ? p.notes.split('-').pop()?.trim()
          : 'Walk-in',
        items: [],
        createdAt: p.createdAt,
        status: 'completed',
      }));
    } catch (error: any) {
      this.logger.error(`Failed to fetch local pharmacy sales: ${error.message}`);
      return [];
    }
  }
}
