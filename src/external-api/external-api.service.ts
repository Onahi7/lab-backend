import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import * as bcrypt from 'bcrypt';
import { randomBytes } from 'crypto';
import { PatientsService } from '../patients/patients.service';
import { OrdersService } from '../orders/orders.service';
import { ExternalApiClient } from '../database/schemas/external-api-client.schema';
import {
  Order,
  OrderStatusEnum,
  PriorityEnum,
} from '../database/schemas/order.schema';
import { Result } from '../database/schemas/result.schema';
import { TestCatalog } from '../database/schemas/test-catalog.schema';
import { TestPanel } from '../database/schemas/test-panel.schema';
import { CreateApiClientDto } from './dto/create-api-client.dto';
import { CreateFacilityTestRequestDto } from './dto/create-facility-test-request.dto';
import { FacilityPaymentDto } from './dto/facility-payment.dto';

@Injectable()
export class ExternalApiService {
  constructor(
    @InjectModel(ExternalApiClient.name)
    private externalApiClientModel: Model<ExternalApiClient>,
    @InjectModel(Order.name) private orderModel: Model<Order>,
    @InjectModel(Result.name) private resultModel: Model<Result>,
    @InjectModel(TestCatalog.name)
    private testCatalogModel: Model<TestCatalog>,
    @InjectModel(TestPanel.name) private testPanelModel: Model<TestPanel>,
    private patientsService: PatientsService,
    private ordersService: OrdersService,
  ) {}

  async createApiClient(dto: CreateApiClientDto) {
    const apiKey = `lis_${randomBytes(32).toString('hex')}`;
    const keyPrefix = apiKey.slice(0, 12);
    const apiKeyHash = await bcrypt.hash(apiKey, 10);

    const client = await this.externalApiClientModel.create({
      ...dto,
      keyPrefix,
      apiKeyHash,
      isActive: dto.isActive ?? true,
    });

    return {
      id: client._id,
      facilityName: client.facilityName,
      keyPrefix: client.keyPrefix,
      apiKey,
      isActive: client.isActive,
      createdAt: client.createdAt,
    };
  }

  async listApiClients() {
    return this.externalApiClientModel
      .find()
      .select('-apiKeyHash')
      .sort({ createdAt: -1 })
      .lean();
  }

  async getCatalog() {
    const [tests, panels] = await Promise.all([
      this.testCatalogModel
        .find({ isActive: true })
        .select('code name category sampleType price unit turnaroundTime panelCode panelName')
        .sort({ category: 1, name: 1 })
        .lean(),
      this.testPanelModel
        .find({ isActive: true })
        .select('code name description price tests')
        .sort({ name: 1 })
        .lean(),
    ]);

    const panelCodes = new Set(panels.map((panel) => panel.code));
    const standaloneTests = tests.filter((test) => !panelCodes.has(test.code));

    return { tests: standaloneTests, panels };
  }

  async createTestRequest(
    facility: ExternalApiClient,
    dto: CreateFacilityTestRequestDto,
  ) {
    const existing = await this.findFacilityOrder(
      facility._id.toString(),
      dto.externalRequestId,
      false,
    );

    if (existing) {
      return this.buildRequestResponse(existing);
    }

    const orderTests = await this.resolveRequestedTests(dto.tests.map((t) => t.code));
    const patient = await this.patientsService.create(dto.patient);

    const order = await this.ordersService.create({
      patientId: patient._id.toString(),
      priority: dto.priority || PriorityEnum.ROUTINE,
      referredByDoctor: dto.referredByDoctor,
      tests: orderTests,
      discount: dto.discount,
      discountType: dto.discountType,
      paymentMethod: dto.payment?.paymentMethod,
      initialPaymentAmount: dto.payment?.amount,
      notes: dto.notes,
      externalFacilityId: facility._id.toString(),
      externalFacilityName: facility.facilityName,
      externalRequestId: dto.externalRequestId,
    } as any);

    return this.buildRequestResponse(order);
  }

  async getTestRequest(facility: ExternalApiClient, externalRequestId: string) {
    const order = await this.findFacilityOrder(
      facility._id.toString(),
      externalRequestId,
      true,
    );

    return this.buildRequestResponse(order);
  }

  async addPayment(
    facility: ExternalApiClient,
    externalRequestId: string,
    dto: FacilityPaymentDto,
  ) {
    const order = await this.findFacilityOrder(
      facility._id.toString(),
      externalRequestId,
      true,
    );

    const payment = await this.ordersService.addPayment(order._id.toString(), {
      ...dto,
      notes: dto.notes || `External facility payment for ${externalRequestId}`,
    });

    return {
      externalRequestId,
      orderNumber: payment.order.orderNumber,
      payment: payment.payment,
      paymentStatus: payment.order.paymentStatus,
      amountPaid: payment.order.amountPaid,
      balance: payment.order.balance,
    };
  }

  async getResults(facility: ExternalApiClient, externalRequestId: string) {
    const order = await this.findFacilityOrder(
      facility._id.toString(),
      externalRequestId,
      true,
    );

    const results = await this.resultModel
      .find({ orderId: new Types.ObjectId(order._id.toString()) })
      .select(
        'testCode testName value unit referenceRange flag status resultedAt verifiedAt panelCode panelName subcategory',
      )
      .sort({ panelName: 1, testName: 1 })
      .lean();

    return {
      externalRequestId,
      orderNumber: order.orderNumber,
      status: order.status,
      patient: order.patientId,
      results,
      isComplete: order.status === OrderStatusEnum.COMPLETED,
    };
  }

  private async resolveRequestedTests(testCodes: string[]) {
    if (!testCodes.length) {
      throw new BadRequestException('At least one test code is required');
    }

    const orderTests: any[] = [];
    for (const rawCode of testCodes) {
      const code = rawCode.trim().toUpperCase();

      const panel = await this.testPanelModel
        .findOne({ code, isActive: true })
        .lean();

      if (panel) {
        for (let index = 0; index < panel.tests.length; index += 1) {
          const panelTest = panel.tests[index] as any;
          orderTests.push({
            testId: panelTest.testId.toString(),
            testCode: panelTest.testCode,
            testName: panelTest.testName,
            panelCode: panel.code,
            panelName: panel.name,
            price: index === 0 ? panel.price : 0,
          });
        }
        continue;
      }

      const test = await this.testCatalogModel.findOne({ code, isActive: true }).lean();

      if (!test) {
        throw new BadRequestException(`Unknown test or panel code: ${code}`);
      }

      orderTests.push({
        testId: test._id.toString(),
        testCode: test.code,
        testName: test.name,
        panelCode: test.panelCode,
        panelName: test.panelName,
        category: test.category,
        price: test.price,
      });
    }

    const deduped = new Map<string, any>();
    for (const test of orderTests) {
      const existing = deduped.get(test.testCode);
      if (!existing || Number(test.price || 0) > Number(existing.price || 0)) {
        deduped.set(test.testCode, test);
      }
    }

    return Array.from(deduped.values());
  }

  private async findFacilityOrder(
    facilityId: string,
    externalRequestId: string,
    throwIfMissing: true,
  ): Promise<any>;
  private async findFacilityOrder(
    facilityId: string,
    externalRequestId: string,
    throwIfMissing: false,
  ): Promise<any | null>;
  private async findFacilityOrder(
    facilityId: string,
    externalRequestId: string,
    throwIfMissing: boolean,
  ) {
    const order = await this.orderModel
      .findOne({ externalFacilityId: facilityId, externalRequestId })
      .populate('patientId', 'patientId firstName lastName age gender mrn phone')
      .lean();

    if (!order && throwIfMissing) {
      throw new NotFoundException(`Request ${externalRequestId} not found`);
    }

    return order;
  }

  private buildRequestResponse(order: any) {
    return {
      externalRequestId: order.externalRequestId,
      externalFacilityName: order.externalFacilityName,
      orderId: order._id,
      orderNumber: order.orderNumber,
      status: order.status,
      paymentStatus: order.paymentStatus,
      subtotal: order.subtotal,
      total: order.total,
      amountPaid: order.amountPaid,
      balance: order.balance,
      patient: order.patientId,
      createdAt: order.createdAt,
      updatedAt: order.updatedAt,
    };
  }
}
