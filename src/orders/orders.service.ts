import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Order, OrderStatusEnum, PaymentStatusEnum } from '../database/schemas/order.schema';
import { OrderTest } from '../database/schemas/order-test.schema';
import { IdSequence } from '../database/schemas/id-sequence.schema';
import { Payment } from '../database/schemas/payment.schema';
import { CreateOrderDto } from './dto/create-order.dto';
import { UpdateOrderDto } from './dto/update-order.dto';
import { CancelOrderDto } from './dto/cancel-order.dto';
import { AddPaymentDto } from './dto/add-payment.dto';
import { RealtimeGateway } from '../realtime/realtime.gateway';

@Injectable()
export class OrdersService {
  private readonly logger = new Logger(OrdersService.name);

  constructor(
    @InjectModel(Order.name) private orderModel: Model<Order>,
    @InjectModel(OrderTest.name) private orderTestModel: Model<OrderTest>,
    @InjectModel(IdSequence.name) private idSequenceModel: Model<IdSequence>,
    @InjectModel(Payment.name) private paymentModel: Model<Payment>,
    private realtimeGateway: RealtimeGateway,
  ) {}

  /**
   * Generate unique order number in format: ORD-YYYYMMDD-XXXX
   */
  private async generateOrderNumber(): Promise<string> {
    const now = new Date();
    const datePart = now.toISOString().slice(0, 10).replace(/-/g, ''); // YYYYMMDD

    const sequenceId = `order_number_${datePart}`;

    // Find and increment the sequence atomically
    const sequence = await this.idSequenceModel.findByIdAndUpdate(
      sequenceId,
      {
        $inc: { currentValue: 1 },
        $setOnInsert: { prefix: 'ORD', datePart },
      },
      { upsert: true, new: true },
    );

    const paddedValue = sequence.currentValue.toString().padStart(4, '0');
    return `ORD-${datePart}-${paddedValue}`;
  }

  /**
   * Calculate order total with discounts
   */
  private calculateTotal(
    subtotal: number,
    discount: number = 0,
    discountType?: string,
  ): number {
    if (discount < 0) {
      throw new BadRequestException('Discount cannot be negative');
    }

    let total = subtotal;

    if (discount > 0 && discountType) {
      if (discountType === 'percentage') {
        if (discount > 100) {
          throw new BadRequestException('Percentage discount cannot exceed 100%');
        }
        total = subtotal * (1 - discount / 100);
      } else if (discountType === 'fixed') {
        if (discount > subtotal) {
          throw new BadRequestException('Fixed discount cannot exceed subtotal');
        }
        total = subtotal - discount;
      }
    }

    // Round to 2 decimal places
    return Math.round(total * 100) / 100;
  }

  /**
   * Create a new order
   */
  async create(createOrderDto: CreateOrderDto, userId?: string): Promise<Order> {
    // Validate patient ID
    if (!Types.ObjectId.isValid(createOrderDto.patientId)) {
      throw new BadRequestException('Invalid patient ID');
    }

    // Calculate subtotal
    const subtotal = createOrderDto.tests.reduce(
      (sum, test) => sum + test.price,
      0,
    );

    // Calculate total with discount
    const total = this.calculateTotal(
      subtotal,
      createOrderDto.discount,
      createOrderDto.discountType,
    );

    // Generate order number
    const orderNumber = await this.generateOrderNumber();

    // Determine initial payment amounts
    const initialAmount = createOrderDto.initialPaymentAmount ?? (createOrderDto.paymentMethod ? total : 0);
    const amountPaid = createOrderDto.paymentMethod ? Math.min(initialAmount, total) : 0;
    const balance = Math.round((total - amountPaid) * 100) / 100;
    let paymentStatus = PaymentStatusEnum.PENDING;
    if (amountPaid >= total) paymentStatus = PaymentStatusEnum.PAID;
    else if (amountPaid > 0) paymentStatus = PaymentStatusEnum.PARTIAL;

    // Create order
    const order = new this.orderModel({
      orderNumber,
      patientId: new Types.ObjectId(createOrderDto.patientId),
      status: amountPaid > 0 ? OrderStatusEnum.PENDING_COLLECTION : OrderStatusEnum.PENDING_PAYMENT,
      priority: createOrderDto.priority,
      subtotal,
      discount: createOrderDto.discount || 0,
      discountType: createOrderDto.discountType,
      total,
      paymentStatus,
      paymentMethod: createOrderDto.paymentMethod,
      amountPaid,
      balance,
      notes: createOrderDto.notes,
      orderedBy: userId ? new Types.ObjectId(userId) : undefined,
    });

    const savedOrder = await order.save();

    // Create order tests
    const orderTests = createOrderDto.tests.map((test) => ({
      orderId: savedOrder._id,
      testId: Types.ObjectId.isValid(test.testId)
        ? new Types.ObjectId(test.testId)
        : undefined,
      testCode: test.testCode,
      testName: test.testName,
      panelCode: test.panelCode,
      panelName: test.panelName,
      price: test.price,
      status: 'pending',
    }));

    await this.orderTestModel.insertMany(orderTests);

    // Record initial payment if any
    if (createOrderDto.paymentMethod && amountPaid > 0) {
      await this.paymentModel.create({
        orderId: savedOrder._id,
        amount: amountPaid,
        paymentMethod: createOrderDto.paymentMethod,
        receivedBy: userId ? new Types.ObjectId(userId) : undefined,
        notes: `Initial payment for order ${orderNumber}`,
      });
    }

    this.logger.log(`Order created: ${savedOrder.orderNumber}`);

    const populatedOrder = await this.findOne(savedOrder._id.toString());

    // Emit real-time event
    this.realtimeGateway.notifyOrderCreated(populatedOrder);

    return populatedOrder;
  }

  /**
   * Find all orders with filters and pagination
   */
  async findAll(
    page: number = 1,
    limit: number = 10,
    status?: string,
    patientId?: string,
    search?: string,
  ): Promise<{ data: Order[]; total: number; page: number; limit: number }> {
    const skip = (page - 1) * limit;
    const query: any = {};

    if (status) {
      query.status = status;
    }

    if (patientId && Types.ObjectId.isValid(patientId)) {
      query.patientId = new Types.ObjectId(patientId);
    }

    if (search) {
      query.orderNumber = { $regex: search, $options: 'i' };
    }

    const [data, total] = await Promise.all([
      this.orderModel
        .find(query)
        .populate('patientId', 'patientId firstName lastName age gender')
        .populate('orderedBy', 'fullName email')
        .populate('collectedBy', 'fullName email')
        .populate('cancelledBy', 'fullName email')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .exec(),
      this.orderModel.countDocuments(query).exec(),
    ]);

    return { data, total, page, limit };
  }

  /**
   * Find order by ID
   */
  async findOne(id: string): Promise<Order> {
    if (!Types.ObjectId.isValid(id)) {
      throw new NotFoundException(`Order with ID ${id} not found`);
    }

    const order = await this.orderModel
      .findById(id)
      .populate('patientId', 'patientId firstName lastName age gender')
      .populate('orderedBy', 'fullName email')
      .populate('collectedBy', 'fullName email')
      .populate('cancelledBy', 'fullName email')
      .exec();

    if (!order) {
      throw new NotFoundException(`Order with ID ${id} not found`);
    }

    return order;
  }

  /**
   * Find order by order number
   */
  async findByOrderNumber(orderNumber: string): Promise<Order> {
    const order = await this.orderModel
      .findOne({ orderNumber })
      .populate('patientId', 'patientId firstName lastName age gender')
      .populate('orderedBy', 'fullName email')
      .populate('collectedBy', 'fullName email')
      .populate('cancelledBy', 'fullName email')
      .exec();

    if (!order) {
      throw new NotFoundException(`Order with number ${orderNumber} not found`);
    }

    return order;
  }

  /**
   * Get order tests
   */
  async getOrderTests(orderId: string): Promise<OrderTest[]> {
    if (!Types.ObjectId.isValid(orderId)) {
      throw new NotFoundException(`Order with ID ${orderId} not found`);
    }

    const tests = await this.orderTestModel
      .find({ orderId: new Types.ObjectId(orderId) })
      .populate('testId')
      .populate('machineId')
      .populate('sampleId')
      .exec();

    return tests;
  }

  /**
   * Update order
   */
  async update(id: string, updateOrderDto: UpdateOrderDto): Promise<Order> {
    if (!Types.ObjectId.isValid(id)) {
      throw new NotFoundException(`Order with ID ${id} not found`);
    }

    const order = await this.orderModel
      .findByIdAndUpdate(id, updateOrderDto, { new: true })
      .populate('patientId', 'patientId firstName lastName age gender')
      .populate('orderedBy', 'fullName email')
      .populate('collectedBy', 'fullName email')
      .populate('cancelledBy', 'fullName email')
      .exec();

    if (!order) {
      throw new NotFoundException(`Order with ID ${id} not found`);
    }

    this.logger.log(`Order updated: ${order.orderNumber}`);

    // Emit real-time event
    this.realtimeGateway.notifyOrderUpdated(order);

    return order;
  }

  /**
   * Cancel order
   */
  async cancel(
    id: string,
    cancelOrderDto: CancelOrderDto,
    userId?: string,
  ): Promise<Order> {
    if (!Types.ObjectId.isValid(id)) {
      throw new NotFoundException(`Order with ID ${id} not found`);
    }

    const order = await this.orderModel.findById(id).exec();

    if (!order) {
      throw new NotFoundException(`Order with ID ${id} not found`);
    }

    if (order.status === OrderStatusEnum.CANCELLED) {
      throw new BadRequestException('Order is already cancelled');
    }

    if (order.status === OrderStatusEnum.COMPLETED) {
      throw new BadRequestException('Cannot cancel a completed order');
    }

    order.status = OrderStatusEnum.CANCELLED;
    order.cancelledAt = new Date();
    order.cancelledBy = userId ? new Types.ObjectId(userId) : undefined;
    order.cancellationReason = cancelOrderDto.reason;

    await order.save();

    this.logger.log(`Order cancelled: ${order.orderNumber}`);

    const populatedOrder = await this.findOne(id);

    // Emit real-time event
    this.realtimeGateway.notifyOrderStatusChanged(
      order._id.toString(),
      order.status,
      order.orderNumber,
    );

    return populatedOrder;
  }

  /**
   * Mark samples as collected
   */
  async collect(id: string, userId?: string): Promise<Order> {
    if (!Types.ObjectId.isValid(id)) {
      throw new NotFoundException(`Order with ID ${id} not found`);
    }

    const order = await this.orderModel.findById(id).exec();

    if (!order) {
      throw new NotFoundException(`Order with ID ${id} not found`);
    }

    if (order.status === OrderStatusEnum.CANCELLED) {
      throw new BadRequestException('Cannot collect samples for a cancelled order');
    }

    if (order.status === OrderStatusEnum.COMPLETED) {
      throw new BadRequestException('Order is already completed');
    }

    if (order.paymentStatus === PaymentStatusEnum.PENDING) {
      throw new BadRequestException('Order requires at least a partial payment before sample collection');
    }

    order.status = OrderStatusEnum.COLLECTED;
    order.collectedAt = new Date();
    order.collectedBy = userId ? new Types.ObjectId(userId) : undefined;

    await order.save();

    this.logger.log(`Samples collected for order: ${order.orderNumber}`);

    const populatedOrder = await this.findOne(id);

    // Emit real-time event
    this.realtimeGateway.notifyOrderStatusChanged(
      order._id.toString(),
      order.status,
      order.orderNumber,
    );

    return populatedOrder;
  }

  /**
   * Get orders pending collection
   */
  async getPendingCollection(): Promise<Order[]> {
    const orders = await this.orderModel
      .find({ status: OrderStatusEnum.PENDING_COLLECTION })
      .populate('patientId', 'patientId firstName lastName age gender')
      .populate('orderedBy', 'fullName email')
      .sort({ createdAt: 1 })
      .exec();

    // Get order tests for each order
    const ordersWithTests = await Promise.all(
      orders.map(async (order) => {
        const tests = await this.orderTestModel
          .find({ orderId: order._id })
          .populate('testId', 'testCode testName')
          .exec();
        
        return {
          ...order.toObject(),
          order_tests: tests,
        };
      }),
    );

    return ordersWithTests as any;
  }

  /**
   * Get orders pending results
   */
  async getPendingResults(): Promise<Order[]> {
    const orders = await this.orderModel
      .find({
        status: {
          $in: [OrderStatusEnum.COLLECTED, OrderStatusEnum.PROCESSING],
        },
      })
      .populate('patientId', 'patientId firstName lastName age gender')
      .populate('orderedBy', 'fullName email')
      .sort({ createdAt: 1 })
      .exec();

    // Get order tests for each order
    const ordersWithTests = await Promise.all(
      orders.map(async (order) => {
        const tests = await this.orderTestModel
          .find({ orderId: order._id })
          .populate('testId', 'testCode testName')
          .exec();
        
        return {
          ...order.toObject(),
          order_tests: tests,
        };
      }),
    );

    return ordersWithTests as any;
  }

  /**
   * Get payment statistics
   */
  async getPaymentStats(startDate?: string, endDate?: string) {
    const query: any = {};

    if (startDate || endDate) {
      query.createdAt = {};
      if (startDate) {
        query.createdAt.$gte = new Date(startDate);
      }
      if (endDate) {
        query.createdAt.$lte = new Date(endDate);
      }
    }

    const [totalOrders, paidOrders, pendingOrders, totalRevenue, paidRevenue] =
      await Promise.all([
        this.orderModel.countDocuments(query),
        this.orderModel.countDocuments({
          ...query,
          paymentStatus: PaymentStatusEnum.PAID,
        }),
        this.orderModel.countDocuments({
          ...query,
          paymentStatus: PaymentStatusEnum.PENDING,
        }),
        this.orderModel.aggregate([
          { $match: query },
          { $group: { _id: null, total: { $sum: '$total' } } },
        ]),
        this.orderModel.aggregate([
          {
            $match: {
              ...query,
              paymentStatus: PaymentStatusEnum.PAID,
            },
          },
          { $group: { _id: null, total: { $sum: '$total' } } },
        ]),
      ]);

    return {
      totalOrders,
      paidOrders,
      pendingOrders,
      totalRevenue: totalRevenue[0]?.total || 0,
      paidRevenue: paidRevenue[0]?.total || 0,
      pendingRevenue: (totalRevenue[0]?.total || 0) - (paidRevenue[0]?.total || 0),
    };
  }

  /**
   * Get daily income breakdown
   */
  async getDailyIncome(startDate?: string, endDate?: string) {
    const query: any = {
      paymentStatus: { $in: [PaymentStatusEnum.PAID, PaymentStatusEnum.PARTIAL] },
      amountPaid: { $gt: 0 },
    };

    if (startDate || endDate) {
      query.createdAt = {};
      if (startDate) {
        query.createdAt.$gte = new Date(startDate);
      }
      if (endDate) {
        query.createdAt.$lte = new Date(endDate);
      }
    }

    const dailyIncome = await this.orderModel.aggregate([
      { $match: query },
      {
        $group: {
          _id: {
            year: { $year: '$createdAt' },
            month: { $month: '$createdAt' },
            day: { $dayOfMonth: '$createdAt' },
          },
          date: { $first: '$createdAt' },
          totalIncome: { $sum: '$amountPaid' },
          orderCount: { $sum: 1 },
          cashPayments: {
            $sum: {
              $cond: [{ $eq: ['$paymentMethod', 'cash'] }, '$amountPaid', 0],
            },
          },
          orangeMoneyPayments: {
            $sum: {
              $cond: [{ $eq: ['$paymentMethod', 'orange_money'] }, '$amountPaid', 0],
            },
          },
          afrimoneyPayments: {
            $sum: {
              $cond: [{ $eq: ['$paymentMethod', 'afrimoney'] }, '$amountPaid', 0],
            },
          },
        },
      },
      { $sort: { date: -1 } },
    ]);

    return dailyIncome;
  }

  /**
   * Add a payment to an order — supports partial / credit payments
   */
  async addPayment(
    id: string,
    addPaymentDto: AddPaymentDto,
    userId?: string,
  ): Promise<{ order: Order; payment: any }> {
    if (!Types.ObjectId.isValid(id)) {
      throw new NotFoundException(`Order with ID ${id} not found`);
    }

    const order = await this.orderModel.findById(id).exec();
    if (!order) {
      throw new NotFoundException(`Order with ID ${id} not found`);
    }

    if (order.status === OrderStatusEnum.CANCELLED) {
      throw new BadRequestException('Cannot add payment to a cancelled order');
    }

    if (order.paymentStatus === PaymentStatusEnum.PAID) {
      throw new BadRequestException('Order is already fully paid');
    }

    const remaining = Math.round((order.total - order.amountPaid) * 100) / 100;
    if (addPaymentDto.amount > remaining + 0.001) {
      throw new BadRequestException(
        `Payment amount (${addPaymentDto.amount}) exceeds remaining balance (${remaining})`,
      );
    }

    // Create payment record
    const payment = await this.paymentModel.create({
      orderId: order._id,
      amount: addPaymentDto.amount,
      paymentMethod: addPaymentDto.paymentMethod,
      receivedBy: userId ? new Types.ObjectId(userId) : undefined,
      notes: addPaymentDto.notes,
    });

    // Update order totals
    order.amountPaid = Math.round((order.amountPaid + addPaymentDto.amount) * 100) / 100;
    order.balance = Math.round((order.total - order.amountPaid) * 100) / 100;
    order.paymentMethod = addPaymentDto.paymentMethod as any;

    if (order.amountPaid >= order.total) {
      order.paymentStatus = PaymentStatusEnum.PAID;
      order.balance = 0;
    } else {
      order.paymentStatus = PaymentStatusEnum.PARTIAL;
    }

    // Move to pending_collection once any payment is made
    if (order.status === OrderStatusEnum.PENDING_PAYMENT) {
      order.status = OrderStatusEnum.PENDING_COLLECTION;
    }

    await order.save();
    this.logger.log(
      `Payment of ${addPaymentDto.amount} added to ${order.orderNumber} via ${addPaymentDto.paymentMethod}. Balance: ${order.balance}`,
    );

    const populatedOrder = await this.findOne(id);
    this.realtimeGateway.notifyOrderUpdated(populatedOrder);

    return { order: populatedOrder, payment };
  }

  /**
   * Get full payment history for an order
   */
  async getPaymentHistory(orderId: string): Promise<any[]> {
    if (!Types.ObjectId.isValid(orderId)) {
      throw new NotFoundException(`Order with ID ${orderId} not found`);
    }

    return this.paymentModel
      .find({ orderId: new Types.ObjectId(orderId) })
      .populate('receivedBy', 'fullName email')
      .sort({ createdAt: 1 })
      .exec();
  }
}
