import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { ConfigService } from '@nestjs/config';
import { Model, Types } from 'mongoose';
import { Order } from '../database/schemas/order.schema';
import { Result, ResultStatusEnum } from '../database/schemas/result.schema';
import { Machine } from '../database/schemas/machine.schema';
import { Sample } from '../database/schemas/sample.schema';
import { Patient, GenderEnum } from '../database/schemas/patient.schema';
import { TestCatalog, TestCategoryEnum } from '../database/schemas/test-catalog.schema';
import { Profile } from '../database/schemas/profile.schema';
import { ResultCategoryDto } from './dto/result-category.dto';
import { ResultItemDto } from './dto/result-item.dto';
import { LabResultReportDto } from './dto/lab-result-report.dto';
import { ReportMetadataDto } from './dto/report-metadata.dto';
import { PatientInfoDto } from './dto/patient-info.dto';
import { OrderInfoDto } from './dto/order-info.dto';
import { VerificationInfoDto } from './dto/verification-info.dto';
import { LaboratoryInfoDto } from './dto/laboratory-info.dto';

@Injectable()
export class ReportsService {
  constructor(
    @InjectModel(Order.name)
    private orderModel: Model<Order>,
    @InjectModel(Result.name)
    private resultModel: Model<Result>,
    @InjectModel(Machine.name)
    private machineModel: Model<Machine>,
    @InjectModel(Sample.name)
    private sampleModel: Model<Sample>,
    @InjectModel(Patient.name)
    private patientModel: Model<Patient>,
    @InjectModel(TestCatalog.name)
    private testCatalogModel: Model<TestCatalog>,
    @InjectModel(Profile.name)
    private profileModel: Model<Profile>,
    private configService: ConfigService,
  ) {}

  /**
   * Generate lab result report for an order
   * @param orderId - Order ID
   * @param userId - User ID requesting the report (for audit logging)
   * @returns Formatted lab result report DTO
   */
  async generateLabResultReport(orderId: string, userId?: string): Promise<LabResultReportDto> {
    // Validate order ID format
    if (!Types.ObjectId.isValid(orderId)) {
      throw new BadRequestException('Invalid order ID format');
    }

    // Fetch order with patient and ordering physician
    const order = await this.orderModel
      .findById(orderId)
      .populate('patientId')
      .populate('orderedBy')
      .exec();

    if (!order) {
      throw new NotFoundException('Order not found');
    }

    // Fetch verified or amended results for this order
    const results = await this.resultModel
      .find({
        orderId: new Types.ObjectId(orderId),
        status: { $in: [ResultStatusEnum.VERIFIED, ResultStatusEnum.AMENDED] },
      })
      .populate('resultedBy')
      .populate('verifiedBy')
      .sort({ testCode: 1 })
      .exec();

    if (!results || results.length === 0) {
      throw new BadRequestException('No verified results available for this order');
    }

    // Get patient info
    const patient = order.patientId as any;
    const patientAge = patient.age; // Use age directly instead of calculating

    // Build patient info DTO
    const patientInfo: PatientInfoDto = {
      patientId: patient.patientNumber || patient._id.toString(),
      fullName: `${patient.firstName} ${patient.lastName}`,
      age: patientAge,
      gender: patient.gender,
      mrn: patient.medicalRecordNumber,
      phone: patient.phone,
      address: patient.address,
    };

    // Build order info DTO
    const orderingPhysician = order.orderedBy as any;
    const orderInfo: OrderInfoDto = {
      orderNumber: order.orderNumber,
      orderDate: order.createdAt,
      collectedAt: order.collectedAt,
      receivedAt: order.createdAt, // Using createdAt as received date
      reportedAt: order.completedAt || new Date(),
      priority: order.priority,
      orderingPhysician: orderingPhysician
        ? `${orderingPhysician.firstName} ${orderingPhysician.lastName}`
        : undefined,
    };

    // Build result items with test catalog info
    const resultItems: (ResultItemDto & { category: TestCategoryEnum })[] = [];
    
    for (const result of results) {
      const testInfo = await this.testCatalogModel.findOne({ code: result.testCode }).exec();
      
      const resultedByProfile = result.resultedBy as any;
      const verifiedByProfile = result.verifiedBy as any;

      // Determine if this result is amended
      const isAmended = result.status === ResultStatusEnum.AMENDED;

      resultItems.push({
        testCode: result.testCode,
        testName: result.testName,
        value: result.value,
        unit: result.unit || testInfo?.unit,
        referenceRange: this.selectReferenceRange(
          result.testCode,
          patient.gender,
          patientAge,
          result.referenceRange || testInfo?.referenceRange,
        ),
        flag: result.flag,
        resultedAt: result.resultedAt,
        comments: result.comments,
        isAmended,
        amendmentReason: result.amendmentReason,
        category: testInfo?.category || TestCategoryEnum.OTHER,
      } as any);
    }

    // Group results by category
    const resultsByCategory = this.groupResultsByCategory(resultItems);

    // Build verification info
    const firstResult = results[0];
    const verifiedByProfile = firstResult.verifiedBy as any;
    const resultedByProfile = firstResult.resultedBy as any;

    const verificationInfo: VerificationInfoDto = {
      performedBy: resultedByProfile
        ? `${resultedByProfile.firstName} ${resultedByProfile.lastName}`
        : undefined,
      verifiedBy: verifiedByProfile
        ? `${verifiedByProfile.firstName} ${verifiedByProfile.lastName}`
        : undefined,
      verifiedAt: firstResult.verifiedAt,
    };

    // Build laboratory info from configuration
    const laboratoryInfo: LaboratoryInfoDto = {
      name: process.env.LAB_NAME || 'Clinical Laboratory',
      logo: process.env.LAB_LOGO_URL,
      address: process.env.LAB_ADDRESS || '123 Medical Center Drive, City, Country',
      phone: process.env.LAB_PHONE || '+1-234-567-8900',
      email: process.env.LAB_EMAIL || 'lab@example.com',
      website: process.env.LAB_WEBSITE,
      licenseNumber: process.env.LAB_LICENSE_NUMBER,
      accreditation: process.env.LAB_ACCREDITATION,
    };

    // Build report metadata
    const reportMetadata: ReportMetadataDto = {
      reportId: `RPT-${order.orderNumber}`,
      generatedAt: new Date(),
      generatedBy: userId || 'system',
    };

    // Return complete report DTO
    return {
      reportMetadata,
      patientInfo,
      orderInfo,
      resultsByCategory,
      verificationInfo,
      laboratoryInfo,
    };
  }

  /**
   * Select appropriate reference range based on patient demographics
   * Note: Current schema has simple referenceRange string. This function
   * is designed for future enhancement when demographic-specific ranges are added.
   * @param testId - Test identifier
   * @param patientGender - Patient's gender
   * @param patientAge - Patient's age in years
   * @param referenceRange - Reference range string from test catalog
   * @returns Selected reference range
   */
  selectReferenceRange(
    testId: string,
    patientGender: GenderEnum,
    patientAge: number,
    referenceRange?: string,
  ): string | undefined {
    // Current implementation returns the simple reference range
    // This can be enhanced when demographic-specific ranges are added to the schema
    return referenceRange;
  }

  /**
   * Group results by test category
   * @param results - Array of result items
   * @returns Results grouped by category with display names
   */
  groupResultsByCategory(results: ResultItemDto[]): ResultCategoryDto[] {
    // Define category order
    const categoryOrder = [
      TestCategoryEnum.CHEMISTRY,
      TestCategoryEnum.HEMATOLOGY,
      TestCategoryEnum.IMMUNOASSAY,
      TestCategoryEnum.URINALYSIS,
      TestCategoryEnum.MICROBIOLOGY,
      TestCategoryEnum.OTHER,
    ];

    // Group results by category
    const grouped = new Map<TestCategoryEnum, ResultItemDto[]>();
    
    for (const result of results) {
      const category = (result as any).category || TestCategoryEnum.OTHER;
      if (!grouped.has(category)) {
        grouped.set(category, []);
      }
      grouped.get(category)!.push(result);
    }

    // Convert to array and sort by category order
    const resultsByCategory: ResultCategoryDto[] = [];
    
    for (const category of categoryOrder) {
      if (grouped.has(category)) {
        resultsByCategory.push({
          category,
          categoryDisplayName: this.formatCategoryDisplayName(category),
          results: grouped.get(category)!,
        });
      }
    }

    return resultsByCategory;
  }

  /**
   * Format category enum value to display name
   * @param category - Test category enum value
   * @returns Formatted display name
   */
  formatCategoryDisplayName(category: TestCategoryEnum): string {
    const displayNames: Record<TestCategoryEnum, string> = {
      [TestCategoryEnum.CHEMISTRY]: 'Clinical Chemistry / Electrolytes',
      [TestCategoryEnum.HEMATOLOGY]: 'Hematology',
      [TestCategoryEnum.IMMUNOASSAY]: 'Immunoassay',
      [TestCategoryEnum.URINALYSIS]: 'Urinalysis',
      [TestCategoryEnum.MICROBIOLOGY]: 'Microbiology',
      [TestCategoryEnum.OTHER]: 'Other Tests',
    };

    return displayNames[category] || category;
  }

  /**
   * Get dashboard statistics
   */
  async getDashboardStats(startDate?: Date, endDate?: Date) {
    const dateFilter: any = {};
    if (startDate || endDate) {
      dateFilter.createdAt = {};
      if (startDate) dateFilter.createdAt.$gte = startDate;
      if (endDate) dateFilter.createdAt.$lte = endDate;
    }

    const [
      totalOrders,
      pendingOrders,
      completedOrders,
      totalRevenue,
      pendingResults,
      criticalResults,
      activeMachines,
      totalSamples,
    ] = await Promise.all([
      this.orderModel.countDocuments(dateFilter),
      this.orderModel.countDocuments({ ...dateFilter, status: 'pending_payment' }),
      this.orderModel.countDocuments({ ...dateFilter, status: 'completed' }),
      this.orderModel.aggregate([
        { $match: { ...dateFilter, paymentStatus: 'paid' } },
        { $group: { _id: null, total: { $sum: '$total' } } },
      ]),
      this.resultModel.countDocuments({ ...dateFilter, status: 'preliminary' }),
      this.resultModel.countDocuments({
        ...dateFilter,
        flag: { $in: ['critical_low', 'critical_high'] },
      }),
      this.machineModel.countDocuments({ status: 'online' }),
      this.sampleModel.countDocuments(dateFilter),
    ]);

    return {
      totalOrders,
      pendingOrders,
      completedOrders,
      totalRevenue: totalRevenue[0]?.total || 0,
      pendingResults,
      criticalResults,
      activeMachines,
      totalSamples,
    };
  }

  /**
   * Get test volume report
   */
  async getTestVolumeReport(startDate?: Date, endDate?: Date) {
    const dateFilter: any = {};
    if (startDate || endDate) {
      dateFilter.createdAt = {};
      if (startDate) dateFilter.createdAt.$gte = startDate;
      if (endDate) dateFilter.createdAt.$lte = endDate;
    }

    const testVolume = await this.resultModel.aggregate([
      { $match: dateFilter },
      {
        $group: {
          _id: '$testCode',
          testName: { $first: '$testName' },
          count: { $sum: 1 },
        },
      },
      { $sort: { count: -1 } },
      { $limit: 20 },
    ]);

    const totalTests = await this.resultModel.countDocuments(dateFilter);

    return {
      testVolume,
      totalTests,
    };
  }

  /**
   * Get turnaround time report
   */
  async getTurnaroundTimeReport(startDate?: Date, endDate?: Date) {
    const dateFilter: any = {};
    if (startDate || endDate) {
      dateFilter.createdAt = {};
      if (startDate) dateFilter.createdAt.$gte = startDate;
      if (endDate) dateFilter.createdAt.$lte = endDate;
    }

    const turnaroundTimes = await this.orderModel.aggregate([
      {
        $match: {
          ...dateFilter,
          status: 'completed',
          collectedAt: { $exists: true },
        },
      },
      {
        $project: {
          orderNumber: 1,
          createdAt: 1,
          collectedAt: 1,
          turnaroundTime: {
            $divide: [
              { $subtract: ['$updatedAt', '$collectedAt'] },
              1000 * 60, // Convert to minutes
            ],
          },
        },
      },
      {
        $group: {
          _id: null,
          avgTurnaroundTime: { $avg: '$turnaroundTime' },
          minTurnaroundTime: { $min: '$turnaroundTime' },
          maxTurnaroundTime: { $max: '$turnaroundTime' },
          count: { $sum: 1 },
        },
      },
    ]);

    return turnaroundTimes[0] || {
      avgTurnaroundTime: 0,
      minTurnaroundTime: 0,
      maxTurnaroundTime: 0,
      count: 0,
    };
  }

  /**
   * Get revenue report
   */
  async getRevenueReport(startDate?: Date, endDate?: Date) {
    const dateFilter: any = {};
    if (startDate || endDate) {
      dateFilter.createdAt = {};
      if (startDate) dateFilter.createdAt.$gte = startDate;
      if (endDate) dateFilter.createdAt.$lte = endDate;
    }

    const revenueByPaymentMethod = await this.orderModel.aggregate([
      { $match: { ...dateFilter, paymentStatus: 'paid' } },
      {
        $group: {
          _id: '$paymentMethod',
          total: { $sum: '$total' },
          count: { $sum: 1 },
        },
      },
      { $sort: { total: -1 } },
    ]);

    const revenueByStatus = await this.orderModel.aggregate([
      { $match: dateFilter },
      {
        $group: {
          _id: '$paymentStatus',
          total: { $sum: '$total' },
          count: { $sum: 1 },
        },
      },
    ]);

    const dailyRevenue = await this.orderModel.aggregate([
      { $match: { ...dateFilter, paymentStatus: 'paid' } },
      {
        $group: {
          _id: {
            $dateToString: { format: '%Y-%m-%d', date: '$createdAt' },
          },
          total: { $sum: '$total' },
          count: { $sum: 1 },
        },
      },
      { $sort: { _id: 1 } },
    ]);

    return {
      revenueByPaymentMethod,
      revenueByStatus,
      dailyRevenue,
    };
  }

  /**
   * Get machine utilization report
   */
  async getMachineUtilizationReport(startDate?: Date, endDate?: Date) {
    const dateFilter: any = {};
    if (startDate || endDate) {
      dateFilter.resultedAt = {};
      if (startDate) dateFilter.resultedAt.$gte = startDate;
      if (endDate) dateFilter.resultedAt.$lte = endDate;
    }

    const machineUtilization = await this.resultModel.aggregate([
      {
        $match: {
          ...dateFilter,
          machineId: { $exists: true },
          source: 'automated',
        },
      },
      {
        $group: {
          _id: '$machineId',
          testCount: { $sum: 1 },
        },
      },
      {
        $lookup: {
          from: 'machines',
          localField: '_id',
          foreignField: '_id',
          as: 'machine',
        },
      },
      { $unwind: '$machine' },
      {
        $project: {
          machineName: '$machine.name',
          machineModel: '$machine.model',
          testCount: 1,
          status: '$machine.status',
        },
      },
      { $sort: { testCount: -1 } },
    ]);

    const totalAutomatedTests = await this.resultModel.countDocuments({
      ...dateFilter,
      source: 'automated',
    });

    const totalManualTests = await this.resultModel.countDocuments({
      ...dateFilter,
      source: 'manual',
    });

    return {
      machineUtilization,
      totalAutomatedTests,
      totalManualTests,
    };
  }

  /**
   * Get test distribution by category
   */
  async getTestDistributionByCategory(startDate?: Date, endDate?: Date) {
    const dateFilter: any = {};
    if (startDate || endDate) {
      dateFilter.createdAt = {};
      if (startDate) dateFilter.createdAt.$gte = startDate;
      if (endDate) dateFilter.createdAt.$lte = endDate;
    }

    // This would require joining with test catalog
    // For now, return a simplified version
    const distribution = await this.resultModel.aggregate([
      { $match: dateFilter },
      {
        $group: {
          _id: '$testCode',
          testName: { $first: '$testName' },
          count: { $sum: 1 },
        },
      },
      { $sort: { count: -1 } },
    ]);

    return distribution;
  }
}
