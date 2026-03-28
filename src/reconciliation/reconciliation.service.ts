import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
  CashReconciliation,
  ReconciliationStatusEnum,
} from '../database/schemas/cash-reconciliation.schema';
import { Order, PaymentStatusEnum, PaymentMethodEnum } from '../database/schemas/order.schema';
import { Expenditure } from '../database/schemas/expenditure.schema';
import { CreateReconciliationDto } from './dto/create-reconciliation.dto';
import { ReviewReconciliationDto } from './dto/review-reconciliation.dto';

@Injectable()
export class ReconciliationService {
  private readonly logger = new Logger(ReconciliationService.name);

  constructor(
    @InjectModel(CashReconciliation.name)
    private reconciliationModel: Model<CashReconciliation>,
    @InjectModel(Order.name)
    private orderModel: Model<Order>,
    @InjectModel(Expenditure.name)
    private expenditureModel: Model<Expenditure>,
  ) {}

  async getExpectedAmounts(date: Date) {
    const startOfDay = new Date(date);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(date);
    endOfDay.setHours(23, 59, 59, 999);

    // Get all paid orders for the day
    const orders = await this.orderModel
      .find({
        createdAt: { $gte: startOfDay, $lte: endOfDay },
        paymentStatus: PaymentStatusEnum.PAID,
      })
      .exec();

    // Calculate income by payment method
    const incomeCash = orders
      .filter((o) => o.paymentMethod === PaymentMethodEnum.CASH)
      .reduce((sum, o) => sum + o.total, 0);
    const incomeOrangeMoney = orders
      .filter((o) => o.paymentMethod === PaymentMethodEnum.ORANGE_MONEY)
      .reduce((sum, o) => sum + o.total, 0);
    const incomeAfrimoney = orders
      .filter((o) => o.paymentMethod === PaymentMethodEnum.AFRIMONEY)
      .reduce((sum, o) => sum + o.total, 0);

    // Get all expenditures for the day
    const expenditures = await this.expenditureModel
      .find({
        expenditureDate: { $gte: startOfDay, $lte: endOfDay },
      })
      .exec();

    // Calculate total expenditures (all come from cash)
    const totalExpenditures = expenditures.reduce((sum, exp) => sum + exp.amount, 0);

    // Expected amounts = Income - Expenditures
    // Expenditures are subtracted from cash only
    const expectedCash = incomeCash - totalExpenditures;
    const expectedOrangeMoney = incomeOrangeMoney;
    const expectedAfrimoney = incomeAfrimoney;

    // Get order counts
    const allOrders = await this.orderModel
      .find({ createdAt: { $gte: startOfDay, $lte: endOfDay } })
      .exec();

    return {
      expectedCash,
      expectedOrangeMoney,
      expectedAfrimoney,
      expectedTotal: expectedCash + expectedOrangeMoney + expectedAfrimoney,
      totalOrders: allOrders.length,
      paidOrders: orders.length,
      pendingOrders: allOrders.length - orders.length,
      totalExpenditures,
      incomeCash,
      incomeOrangeMoney,
      incomeAfrimoney,
    };
  }

  async create(createDto: CreateReconciliationDto, userId: string) {
    const startOfDay = new Date(createDto.reconciliationDate);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(createDto.reconciliationDate);
    endOfDay.setHours(23, 59, 59, 999);

    const existing = await this.reconciliationModel
      .findOne({ reconciliationDate: { $gte: startOfDay, $lte: endOfDay } })
      .exec();

    if (existing) {
      throw new BadRequestException('Reconciliation already exists for this date');
    }

    const expected = await this.getExpectedAmounts(createDto.reconciliationDate);
    const actualTotal = createDto.actualCash + createDto.actualOrangeMoney + createDto.actualAfrimoney;

    const reconciliation = new this.reconciliationModel({
      reconciliationDate: createDto.reconciliationDate,
      submittedBy: new Types.ObjectId(userId),
      submittedAt: new Date(),
      expectedCash: expected.expectedCash,
      expectedOrangeMoney: expected.expectedOrangeMoney,
      expectedAfrimoney: expected.expectedAfrimoney,
      expectedTotal: expected.expectedTotal,
      actualCash: createDto.actualCash,
      actualOrangeMoney: createDto.actualOrangeMoney,
      actualAfrimoney: createDto.actualAfrimoney,
      actualTotal,
      cashVariance: createDto.actualCash - expected.expectedCash,
      orangeMoneyVariance: createDto.actualOrangeMoney - expected.expectedOrangeMoney,
      afrimoneyVariance: createDto.actualAfrimoney - expected.expectedAfrimoney,
      totalVariance: actualTotal - expected.expectedTotal,
      totalOrders: expected.totalOrders,
      paidOrders: expected.paidOrders,
      pendingOrders: expected.pendingOrders,
      notes: createDto.notes,
      status: ReconciliationStatusEnum.PENDING,
    });

    await reconciliation.save();
    this.logger.log(`Reconciliation created for ${createDto.reconciliationDate}`);
    return this.findOne(reconciliation._id.toString());
  }

  async findAll(status?: string) {
    const query: any = {};
    if (status && status !== 'all') {
      query.status = status;
    }

    return this.reconciliationModel
      .find(query)
      .populate('submittedBy', 'fullName email')
      .populate('reviewedBy', 'fullName email')
      .sort({ reconciliationDate: -1 })
      .exec();
  }

  async findOne(id: string) {
    if (!Types.ObjectId.isValid(id)) {
      throw new NotFoundException(`Reconciliation with ID ${id} not found`);
    }

    const reconciliation = await this.reconciliationModel
      .findById(id)
      .populate('submittedBy', 'fullName email')
      .populate('reviewedBy', 'fullName email')
      .exec();

    if (!reconciliation) {
      throw new NotFoundException(`Reconciliation with ID ${id} not found`);
    }

    return reconciliation;
  }

  async review(id: string, reviewDto: ReviewReconciliationDto, userId: string) {
    const reconciliation = await this.reconciliationModel.findById(id).exec();

    if (!reconciliation) {
      throw new NotFoundException(`Reconciliation with ID ${id} not found`);
    }

    if (reconciliation.status !== ReconciliationStatusEnum.PENDING) {
      throw new BadRequestException('Reconciliation has already been reviewed');
    }

    reconciliation.status = reviewDto.approved
      ? ReconciliationStatusEnum.APPROVED
      : ReconciliationStatusEnum.REJECTED;
    reconciliation.reviewedBy = new Types.ObjectId(userId);
    reconciliation.reviewedAt = new Date();
    reconciliation.reviewNotes = reviewDto.notes;

    await reconciliation.save();
    this.logger.log(`Reconciliation ${reviewDto.approved ? 'approved' : 'rejected'} by ${userId}`);

    return this.findOne(id);
  }

  async getPendingCount() {
    return this.reconciliationModel
      .countDocuments({ status: ReconciliationStatusEnum.PENDING })
      .exec();
  }
}
