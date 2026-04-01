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
import { Order, PaymentStatusEnum } from '../database/schemas/order.schema';
import { Payment } from '../database/schemas/payment.schema';
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
    @InjectModel(Payment.name)
    private paymentModel: Model<Payment>,
    @InjectModel(Expenditure.name)
    private expenditureModel: Model<Expenditure>,
  ) {}

  async getExpectedAmounts(date: Date) {
    const startOfDay = new Date(date);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(date);
    endOfDay.setHours(23, 59, 59, 999);

    // Use Payment model (same source as getDailyIncome) for gross collected
    const payments = await this.paymentModel
      .find({ createdAt: { $gte: startOfDay, $lte: endOfDay } })
      .exec();

    // Gross collected by payment method
    const incomeCash = payments
      .filter((p) => p.paymentMethod === 'cash')
      .reduce((sum, p) => sum + p.amount, 0);
    const incomeOrangeMoney = payments
      .filter((p) => p.paymentMethod === 'orange_money')
      .reduce((sum, p) => sum + p.amount, 0);
    const incomeAfrimoney = payments
      .filter((p) => p.paymentMethod === 'afrimoney')
      .reduce((sum, p) => sum + p.amount, 0);

    // Get all expenditures for the day
    const expenditures = await this.expenditureModel
      .find({
        expenditureDate: { $gte: startOfDay, $lte: endOfDay },
      })
      .exec();

    // Deduct expenditures per payment method
    const cashExpenditures = expenditures
      .filter((e) => e.paymentMethod === 'cash')
      .reduce((sum, e) => sum + e.amount, 0);
    const orangeExpenditures = expenditures
      .filter((e) => e.paymentMethod === 'orange_money')
      .reduce((sum, e) => sum + e.amount, 0);
    const afriExpenditures = expenditures
      .filter((e) => e.paymentMethod === 'afrimoney')
      .reduce((sum, e) => sum + e.amount, 0);
    const totalExpenditures = expenditures.reduce((sum, exp) => sum + exp.amount, 0);

    // Expected = gross collected per method minus expenditures per method
    const expectedCash = incomeCash - cashExpenditures;
    const expectedOrangeMoney = incomeOrangeMoney - orangeExpenditures;
    const expectedAfrimoney = incomeAfrimoney - afriExpenditures;

    // Get order counts
    const allOrders = await this.orderModel
      .find({ createdAt: { $gte: startOfDay, $lte: endOfDay } })
      .exec();
    const paidOrders = allOrders.filter(
      (o) => o.paymentStatus === PaymentStatusEnum.PAID,
    );

    return {
      expectedCash,
      expectedOrangeMoney,
      expectedAfrimoney,
      expectedTotal: expectedCash + expectedOrangeMoney + expectedAfrimoney,
      totalOrders: allOrders.length,
      paidOrders: paidOrders.length,
      pendingOrders: allOrders.length - paidOrders.length,
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
      // Variance = expected − actual (positive = shortage, negative = surplus)
      cashVariance: expected.expectedCash - createDto.actualCash,
      orangeMoneyVariance: expected.expectedOrangeMoney - createDto.actualOrangeMoney,
      afrimoneyVariance: expected.expectedAfrimoney - createDto.actualAfrimoney,
      totalVariance: expected.expectedTotal - actualTotal,
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
