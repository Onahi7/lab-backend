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
import { TestCatalog } from '../database/schemas/test-catalog.schema';
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
    @InjectModel(TestCatalog.name) private testCatalogModel: Model<TestCatalog>,
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
   * Expand tests to include linked tests (e.g., CRP automatically includes HSCRP)
   */
  private async expandLinkedTests(tests: any[]): Promise<any[]> {
    const expandedTests = [...tests];
    const addedTestCodes = new Set(tests.map(t => t.testCode));

    for (const test of tests) {
      // Look up the test in catalog to check for linked tests
      const catalogTest = await this.testCatalogModel.findOne({ code: test.testCode }).lean();
      
      if (catalogTest?.linkedTests && catalogTest.linkedTests.length > 0) {
        for (const linkedTestCode of catalogTest.linkedTests) {
          // Only add if not already in the order
          if (!addedTestCodes.has(linkedTestCode)) {
            const linkedTest = await this.testCatalogModel.findOne({ code: linkedTestCode }).lean();
            
            if (linkedTest) {
              expandedTests.push({
                testId: linkedTest._id.toString(),
                testCode: linkedTest.code,
                testName: linkedTest.name,
                panelCode: linkedTest.panelCode,
                panelName: linkedTest.panelName,
                category: linkedTest.category,
                price: 0, // Linked tests are included free
              });
              addedTestCodes.add(linkedTestCode);
              this.logger.log(`Auto-added linked test: ${linkedTestCode} for ${test.testCode}`);
            }
          }
        }
      }
    }

    return expandedTests;
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

    // Determine initial payment amounts (split payments take precedence)
    let amountPaid = 0;
    if (createOrderDto.initialPayments && createOrderDto.initialPayments.length > 0) {
      const requestedTotal = createOrderDto.initialPayments.reduce((s, p) => s + p.amount, 0);
      amountPaid = Math.min(Math.round(requestedTotal * 100) / 100, total);
    } else if (createOrderDto.paymentMethod) {
      const initialAmount = createOrderDto.initialPaymentAmount ?? total;
      amountPaid = Math.min(Math.round(initialAmount * 100) / 100, total);
    }
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
      referredByDoctor: createOrderDto.referredByDoctor,
      orderedBy: userId ? new Types.ObjectId(userId) : undefined,
    });

    const savedOrder = await order.save();

    // Expand tests to include linked tests (e.g., CRP automatically includes HSCRP)
    const expandedTests = await this.expandLinkedTests(createOrderDto.tests);

    // Create order tests
    const orderTests = expandedTests.map((test) => ({
      orderId: savedOrder._id,
      testId: Types.ObjectId.isValid(test.testId)
        ? new Types.ObjectId(test.testId)
        : undefined,
      testCode: test.testCode,
      testName: test.testName,
      panelCode: test.panelCode,
      panelName: test.panelName,
      category: test.category,
      price: test.price,
      status: 'pending',
    }));

    await this.orderTestModel.insertMany(orderTests);

    // Record initial payments (supports split payments)
    if (createOrderDto.initialPayments && createOrderDto.initialPayments.length > 0 && amountPaid > 0) {
      for (const p of createOrderDto.initialPayments) {
        if (p.amount > 0) {
          await this.paymentModel.create({
            orderId: savedOrder._id,
            amount: Math.round(p.amount * 100) / 100,
            paymentMethod: p.paymentMethod,
            receivedBy: userId ? new Types.ObjectId(userId) : undefined,
            notes: `Initial payment for order ${orderNumber}`,
          });
        }
      }
    } else if (createOrderDto.paymentMethod && amountPaid > 0) {
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
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean()
        .exec(),
      this.orderModel.countDocuments(query).exec(),
    ]);

    return { data: data as unknown as Order[], total, page, limit };
  }

  /**
   * Find order by ID
   */
  async findOne(id: string): Promise<any> {
    if (!Types.ObjectId.isValid(id)) {
      throw new NotFoundException(`Order with ID ${id} not found`);
    }

    const order = await this.orderModel
      .findById(id)
      .populate('patientId', 'patientId firstName lastName age gender')
      .populate('orderedBy', 'fullName email')
      .populate('collectedBy', 'fullName email')
      .populate('cancelledBy', 'fullName email')
      .lean()
      .exec();

    if (!order) {
      throw new NotFoundException(`Order with ID ${id} not found`);
    }

    const orderTests = await this.orderTestModel
      .find({ orderId: new Types.ObjectId(id) })
      .populate('testId')
      .lean()
      .exec();

    return { ...order, order_tests: orderTests };
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
   * Get payment statistics — aggregates from Payment collection for accurate split-payment reporting
   */
  async getPaymentStats(startDate?: string, endDate?: string) {
    const orderQuery: any = {};
    const paymentQuery: any = {};

    if (startDate || endDate) {
      const dateFilter: any = {};
      if (startDate) dateFilter.$gte = new Date(startDate);
      if (endDate) dateFilter.$lte = new Date(endDate);
      orderQuery.createdAt = dateFilter;
      paymentQuery.createdAt = dateFilter;
    }

    const [totalOrders, paidOrders, pendingOrders, totalRevenue, collectedByMethod] =
      await Promise.all([
        this.orderModel.countDocuments(orderQuery),
        this.orderModel.countDocuments({
          ...orderQuery,
          paymentStatus: PaymentStatusEnum.PAID,
        }),
        this.orderModel.countDocuments({
          ...orderQuery,
          paymentStatus: PaymentStatusEnum.PENDING,
        }),
        this.orderModel.aggregate([
          { $match: orderQuery },
          { $group: { _id: null, total: { $sum: '$total' } } },
        ]),
        this.paymentModel.aggregate([
          { $match: paymentQuery },
          { $group: { _id: '$paymentMethod', total: { $sum: '$amount' } } },
        ]),
      ]);

    const methodTotals: Record<string, number> = { cash: 0, orange_money: 0, afrimoney: 0 };
    let paidRevenue = 0;
    for (const m of collectedByMethod) {
      if (m._id in methodTotals) methodTotals[m._id] = m.total;
      paidRevenue += m.total;
    }

    const totalRev = totalRevenue[0]?.total || 0;
    return {
      totalOrders,
      paidOrders,
      pendingOrders,
      totalRevenue: totalRev,
      paidRevenue,
      pendingRevenue: totalRev - paidRevenue,
      cashCollected: methodTotals.cash,
      orangeMoneyCollected: methodTotals.orange_money,
      afrimoneyCollected: methodTotals.afrimoney,
    };
  }

  /**
   * Get daily income breakdown — aggregates from Payment collection for accurate split-payment reporting
   */
  async getDailyIncome(startDate?: string, endDate?: string) {
    const matchQuery: any = {};

    if (startDate || endDate) {
      matchQuery.createdAt = {};
      if (startDate) matchQuery.createdAt.$gte = new Date(startDate);
      if (endDate) matchQuery.createdAt.$lte = new Date(endDate);
    }

    const dailyIncome = await this.paymentModel.aggregate([
      { $match: matchQuery },
      {
        $group: {
          _id: {
            year: { $year: '$createdAt' },
            month: { $month: '$createdAt' },
            day: { $dayOfMonth: '$createdAt' },
          },
          date: { $first: '$createdAt' },
          totalIncome: { $sum: '$amount' },
          paymentCount: { $sum: 1 },
          cashPayments: {
            $sum: { $cond: [{ $eq: ['$paymentMethod', 'cash'] }, '$amount', 0] },
          },
          orangeMoneyPayments: {
            $sum: { $cond: [{ $eq: ['$paymentMethod', 'orange_money'] }, '$amount', 0] },
          },
          afrimoneyPayments: {
            $sum: { $cond: [{ $eq: ['$paymentMethod', 'afrimoney'] }, '$amount', 0] },
          },
        },
      },
      { $sort: { date: -1 } },
    ]);

    return dailyIncome;
  }

  /**
   * Get outstanding balances — orders with pending or partial payment status
   */
  async getOutstandingBalances() {
    const orders = await this.orderModel
      .find({
        paymentStatus: { $in: [PaymentStatusEnum.PENDING, PaymentStatusEnum.PARTIAL] },
        status: { $ne: OrderStatusEnum.CANCELLED },
      })
      .populate('patientId', 'firstName lastName')
      .sort({ createdAt: -1 })
      .lean()
      .exec();

    const partialOrders = orders.filter((o) => o.paymentStatus === PaymentStatusEnum.PARTIAL);
    const pendingOrders = orders.filter((o) => o.paymentStatus === PaymentStatusEnum.PENDING);

    const partialBalance = partialOrders.reduce((sum, o) => sum + (o.balance || 0), 0);
    const pendingBalance = pendingOrders.reduce((sum, o) => sum + (o.total || 0), 0);

    return {
      orders: orders.map((o) => ({
        _id: o._id,
        orderNumber: o.orderNumber,
        paymentStatus: o.paymentStatus,
        total: o.total,
        amountPaid: o.amountPaid,
        balance: o.balance,
        createdAt: o.createdAt,
        patientId: o.patientId,
      })),
      summary: {
        partialCount: partialOrders.length,
        pendingCount: pendingOrders.length,
        partialBalance,
        pendingBalance,
        totalOutstanding: partialBalance + pendingBalance,
      },
    };
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
