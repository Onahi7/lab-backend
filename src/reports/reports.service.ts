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
import { OrderTest } from '../database/schemas/order-test.schema';
import { PanelInterpretation } from '../database/schemas/panel-interpretation.schema';
import { resolveReferenceRange } from '../common/utils/reference-range-resolver';
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
  private static readonly MCHC_TEST_CODE = 'MCHC';

  private static readonly TEST_CODE_ALIASES: Record<string, string[]> = {
    HSCRP: ['HSCR'],
    HSCR: ['HSCRP'],
    UPROTEIN: ['URINEPROTEIN', 'UPRO'],
    URINEPROTEIN: ['UPROTEIN', 'UPRO'],
    UPRO: ['UPROTEIN', 'URINEPROTEIN'],
  };

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
    @InjectModel(OrderTest.name)
    private orderTestModel: Model<OrderTest>,
    @InjectModel(PanelInterpretation.name)
    private panelInterpretationModel: Model<PanelInterpretation>,
    private configService: ConfigService,
  ) {}

  private isMchcTest(testCode?: string): boolean {
    return this.normalizeLookupToken(testCode) === ReportsService.MCHC_TEST_CODE;
  }

  private formatScaledNumericValue(numericValue: number): string {
    if (!Number.isFinite(numericValue)) {
      return '';
    }

    return parseFloat(numericValue.toFixed(1)).toString();
  }

  private normalizeMchcValue(rawValue?: string): string | undefined {
    if (rawValue === undefined || rawValue === null) {
      return rawValue;
    }

    const value = String(rawValue).trim();
    if (!value) {
      return value;
    }

    const numericValue = parseFloat(value);
    if (Number.isNaN(numericValue)) {
      return value;
    }

    const normalizedValue = numericValue > 100 ? numericValue / 10 : numericValue;
    return this.formatScaledNumericValue(normalizedValue);
  }

  private normalizeMchcRange(rawRange?: string): string | undefined {
    if (rawRange === undefined || rawRange === null) {
      return rawRange;
    }

    const range = String(rawRange).trim();
    if (!range) {
      return range;
    }

    const sanitizedRange = range.replace(/\bg\s*\/\s*(?:d)?l\b/gi, '').trim();

    const rangeMatch = sanitizedRange.match(/^(-?\d*\.?\d+)\s*(?:-|–)\s*(-?\d*\.?\d+)$/);
    if (rangeMatch) {
      const low = parseFloat(rangeMatch[1]);
      const high = parseFloat(rangeMatch[2]);
      const normalizedLow = low > 100 ? low / 10 : low;
      const normalizedHigh = high > 100 ? high / 10 : high;
      return `${this.formatScaledNumericValue(normalizedLow)}-${this.formatScaledNumericValue(normalizedHigh)}`;
    }

    return sanitizedRange.replace(/-?\d*\.?\d+/g, (token) => {
      const numericValue = parseFloat(token);
      if (Number.isNaN(numericValue)) {
        return token;
      }

      const normalizedValue = numericValue > 100 ? numericValue / 10 : numericValue;
      return this.formatScaledNumericValue(normalizedValue);
    });
  }

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

    // Fetch results for this order (including preliminary for immediate printing workflows)
    const results = await this.resultModel
      .find({
        orderId: new Types.ObjectId(orderId),
        status: {
          $in: [
            ResultStatusEnum.PRELIMINARY,
            ResultStatusEnum.VERIFIED,
            ResultStatusEnum.AMENDED,
          ],
        },
      })
      .sort({ resultedAt: 1, createdAt: 1, _id: 1 })
      .populate('resultedBy')
      .populate('verifiedBy')
      .exec();

    if (!results || results.length === 0) {
      throw new BadRequestException('No results available for this order');
    }

    const orderTests = await this.orderTestModel
      .find({ orderId: new Types.ObjectId(orderId) })
      .sort({ createdAt: 1, _id: 1 })
      .exec();

    const orderTestsById = new Map<string, OrderTest>();
    const orderTestsByCode = new Map<string, { index: number; orderTest: OrderTest }[]>();
    const orderTestsByNormalizedCode = new Map<string, { index: number; orderTest: OrderTest }[]>();
    const orderTestsByNormalizedName = new Map<string, { index: number; orderTest: OrderTest }[]>();
    const orderTestIndexById = new Map<string, number>();

    orderTests.forEach((orderTest, index) => {
      orderTestsById.set(orderTest._id.toString(), orderTest);
      orderTestIndexById.set(orderTest._id.toString(), index);
      const current = orderTestsByCode.get(orderTest.testCode) || [];
      current.push({ index, orderTest });
      orderTestsByCode.set(orderTest.testCode, current);

      const normalizedCode = this.normalizeLookupToken(orderTest.testCode);
      if (normalizedCode) {
        const currentNormalized = orderTestsByNormalizedCode.get(normalizedCode) || [];
        currentNormalized.push({ index, orderTest });
        orderTestsByNormalizedCode.set(normalizedCode, currentNormalized);
      }

      const normalizedName = this.normalizeLookupToken(orderTest.testName);
      if (normalizedName) {
        const currentByName = orderTestsByNormalizedName.get(normalizedName) || [];
        currentByName.push({ index, orderTest });
        orderTestsByNormalizedName.set(normalizedName, currentByName);
      }
    });

    const nextOrderTestIndexByCode = new Map<string, number>();
    const nextOrderTestIndexByNormalizedCode = new Map<string, number>();
    const nextOrderTestIndexByNormalizedName = new Map<string, number>();

    const catalogCodes = new Set<string>();

    for (const result of results) {
      if (result.testCode) {
        const code = result.testCode.trim();
        if (code) {
          catalogCodes.add(code);
          catalogCodes.add(code.toUpperCase());
          for (const lookupToken of this.getLookupTokens(code)) {
            catalogCodes.add(lookupToken);
          }
        }
      }
    }

    for (const orderTest of orderTests) {
      if (orderTest.testCode) {
        const code = orderTest.testCode.trim();
        if (code) {
          catalogCodes.add(code);
          catalogCodes.add(code.toUpperCase());
          for (const lookupToken of this.getLookupTokens(code)) {
            catalogCodes.add(lookupToken);
          }
        }
      }
    }

    const orderTestCatalogIds = orderTests
      .map((orderTest) => orderTest.testId)
      .filter((testId): testId is Types.ObjectId => !!testId);

    const testCatalogQuery: any[] = [];

    if (catalogCodes.size > 0) {
      testCatalogQuery.push({ code: { $in: Array.from(catalogCodes) } });
    }

    if (orderTestCatalogIds.length > 0) {
      testCatalogQuery.push({ _id: { $in: orderTestCatalogIds } });
    }

    const testCatalogEntries =
      testCatalogQuery.length > 0
        ? await this.testCatalogModel.find({ $or: testCatalogQuery }).exec()
        : [];

    const testCatalogById = new Map<string, TestCatalog>();
    const testCatalogByNormalizedCode = new Map<string, TestCatalog>();

    for (const testCatalogEntry of testCatalogEntries) {
      testCatalogById.set(testCatalogEntry._id.toString(), testCatalogEntry);

      for (const lookupToken of this.getLookupTokens(testCatalogEntry.code)) {
        if (!testCatalogByNormalizedCode.has(lookupToken)) {
          testCatalogByNormalizedCode.set(lookupToken, testCatalogEntry);
        }
      }
    }

    // Get patient info
    const patient = order.patientId as any;
    const patientAge = patient.age; // Use age directly instead of calculating

    // Build patient info DTO
    const patientInfo: PatientInfoDto = {
      patientId: patient.patientNumber || patient._id.toString(),
      fullName: `${patient.firstName} ${patient.lastName}`,
      age: patientAge,
      ageValue: patient.ageValue,
      ageUnit: patient.ageUnit,
      gender: patient.gender,
      mrn: patient.medicalRecordNumber,
      phone: patient.phone,
      address: patient.address,
    };

    // Build order info DTO
    const orderingPhysician = order.orderedBy as any;
    const referredByDoctor = (order as any).referredByDoctor;
    const orderInfo: OrderInfoDto = {
      orderNumber: order.orderNumber,
      orderDate: order.createdAt,
      collectedAt: order.collectedAt,
      receivedAt: order.createdAt, // Using createdAt as received date
      reportedAt: order.completedAt || new Date(),
      priority: order.priority,
      orderingPhysician: referredByDoctor || (orderingPhysician
        ? `${orderingPhysician.firstName} ${orderingPhysician.lastName}`
        : undefined),
    };

    // Build result items with test catalog info
    const resultItems: (ResultItemDto & { category: TestCategoryEnum; displayOrder: number })[] = [];
    
    for (const result of results) {
      let orderTest: OrderTest | undefined;
      let displayOrder = Number.MAX_SAFE_INTEGER;

      if (result.orderTestId) {
        const orderTestId = result.orderTestId.toString();
        orderTest = orderTestsById.get(orderTestId);
        displayOrder = orderTestIndexById.get(orderTestId) ?? Number.MAX_SAFE_INTEGER;
      } else {
        const matchedByCode = orderTestsByCode.get(result.testCode) || [];
        const nextIndex = nextOrderTestIndexByCode.get(result.testCode) || 0;
        const matched = matchedByCode[nextIndex] || matchedByCode[0];

        if (matched) {
          orderTest = matched.orderTest;
          displayOrder = matched.index;
          nextOrderTestIndexByCode.set(result.testCode, nextIndex + 1);
        }
      }

      if (!orderTest) {
        const normalizedResultCode = this.normalizeLookupToken(result.testCode);

        if (normalizedResultCode) {
          const matchedByNormalizedCode =
            orderTestsByNormalizedCode.get(normalizedResultCode) || [];
          const nextNormalizedCodeIndex =
            nextOrderTestIndexByNormalizedCode.get(normalizedResultCode) || 0;
          const matched =
            matchedByNormalizedCode[nextNormalizedCodeIndex] || matchedByNormalizedCode[0];

          if (matched) {
            orderTest = matched.orderTest;
            displayOrder = matched.index;
            nextOrderTestIndexByNormalizedCode.set(
              normalizedResultCode,
              nextNormalizedCodeIndex + 1,
            );
          }
        }
      }

      if (!orderTest) {
        const normalizedResultName = this.normalizeLookupToken(result.testName);

        if (normalizedResultName) {
          const matchedByName = orderTestsByNormalizedName.get(normalizedResultName) || [];
          const nextNameIndex = nextOrderTestIndexByNormalizedName.get(normalizedResultName) || 0;
          const matched = matchedByName[nextNameIndex] || matchedByName[0];

          if (matched) {
            orderTest = matched.orderTest;
            displayOrder = matched.index;
            nextOrderTestIndexByNormalizedName.set(normalizedResultName, nextNameIndex + 1);
          }
        }
      }

      const normalizedResultCode = this.normalizeLookupToken(result.testCode);
      const normalizedOrderTestCode = this.normalizeLookupToken(orderTest?.testCode);

      const testInfoByOrderTestId = orderTest?.testId
        ? testCatalogById.get(orderTest.testId.toString())
        : undefined;
      const testInfoByResultCode = normalizedResultCode
        ? testCatalogByNormalizedCode.get(normalizedResultCode)
        : undefined;
      const testInfoByOrderTestCode = normalizedOrderTestCode
        ? testCatalogByNormalizedCode.get(normalizedOrderTestCode)
        : undefined;
      const testInfo =
        testInfoByOrderTestId || testInfoByResultCode || testInfoByOrderTestCode;

      const testCode = orderTest?.testCode || result.testCode;
      const testName =
        testInfo?.name ||
        (result.testName && result.testName.trim()) ||
        orderTest?.testName ||
        testCode;
      const isMchc = this.isMchcTest(testCode);
      const selectedReferenceRange = this.selectReferenceRange(
        testCode,
        patient.gender,
        patientAge,
        result.referenceRange,
        testInfo?.referenceRanges,
        testInfo?.referenceRange,
      );
      const normalizedValue = isMchc
        ? this.normalizeMchcValue(result.value) || result.value
        : result.value;
      const normalizedUnit = isMchc ? 'g/dL' : (result.unit || testInfo?.unit);
      const normalizedReferenceRange = isMchc
        ? this.normalizeMchcRange(selectedReferenceRange)
        : selectedReferenceRange;
      
      const resultedByProfile = result.resultedBy as any;
      const verifiedByProfile = result.verifiedBy as any;

      // Determine if this result is amended
      const isAmended = result.status === ResultStatusEnum.AMENDED;

      // Determine category, inferring urinalysis for urine-coded tests miscategorised as other
      const resolvedCategory = (() => {
        const cat =
          testInfo?.category ||
          this.resolveResultCategory(result.category);
        const resolvedSubcategory = this.resolveUrinalysisSubcategory(
          testCode,
          orderTest?.panelCode,
          result.subcategory || testInfo?.subcategory,
        );

        if (!cat || cat === TestCategoryEnum.OTHER) {
          const normalizedCode = this.normalizeLookupToken(testCode);
          const normalizedSubcategory = this.normalizeLookupToken(resolvedSubcategory);
          const nameLower = testName.toLowerCase();

          const isUrineByName = nameLower.startsWith('urine ') || nameLower === 'urine';
          const isUrineByCode =
            normalizedCode.startsWith('URINE') ||
            normalizedCode === 'UPROTEIN' ||
            normalizedCode === 'UPRO';
          const isUrineBySubcategory =
            normalizedSubcategory === 'DIPSTICKCHEMICAL' ||
            normalizedSubcategory === 'MICROSCOPIC' ||
            normalizedSubcategory === 'PHYSICALEXAMINATION';

          if (isUrineByName || isUrineByCode || isUrineBySubcategory) {
            return TestCategoryEnum.URINALYSIS;
          }
        }
        return cat || TestCategoryEnum.OTHER;
      })();

      // Auto-generate Positive/Negative interpretation for BHCG based on numeric value
      let resolvedComments = result.comments;
      if (this.normalizeLookupToken(testCode) === 'BHCG' && normalizedValue) {
        const numericValue = parseFloat(normalizedValue);
        if (!isNaN(numericValue)) {
          resolvedComments = numericValue > 5 ? 'Positive' : 'Negative';
        }
      }

      resultItems.push({
        testCode,
        testName,
        panelCode: orderTest?.panelCode,
        panelName: orderTest?.panelName,
        value: normalizedValue,
        unit: normalizedUnit,
        referenceRange: normalizedReferenceRange,
        flag: result.flag,
        resultedAt: result.resultedAt,
        comments: resolvedComments,
        isAmended,
        amendmentReason: result.amendmentReason,
        displayOrder,
        subcategory: this.resolveUrinalysisSubcategory(
          testCode,
          orderTest?.panelCode,
          result.subcategory || testInfo?.subcategory,
        ),
        category: resolvedCategory,
      } as any);
    }

    resultItems.sort((a, b) => a.displayOrder - b.displayOrder);

    // Group results by category
    const resultsByCategory = this.groupResultsByCategory(resultItems);

    // Build verification info
    const firstResult = results[0];
    const verifiedByProfile = firstResult.verifiedBy as any;
    const resultedByProfile = firstResult.resultedBy as any;

    const verificationInfo: VerificationInfoDto = {
      performedBy: resultedByProfile?.fullName || undefined,
      verifiedBy: verifiedByProfile?.fullName || undefined,
      verifiedAt: firstResult.verifiedAt,
    };

    // Build laboratory info from configuration
    const laboratoryInfo: LaboratoryInfoDto = {
      name: process.env.LAB_NAME || 'Clinical Laboratory',
      logo: process.env.LAB_LOGO_URL,
      address: process.env.LAB_ADDRESS || '123 Medical Center Drive, City, Country',
      phone: process.env.LAB_PHONE || '+232-XX-XXXXXX',
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

    // Fetch panel interpretations for this order
    const panelInterpretations = await this.panelInterpretationModel
      .find({ orderId: new Types.ObjectId(orderId) })
      .exec();

    // Return complete report DTO
    return {
      reportMetadata,
      patientInfo,
      orderInfo,
      resultsByCategory,
      panelInterpretations: panelInterpretations.map(interp => ({
        panelCode: interp.panelCode,
        panelName: interp.panelName,
        wbcMessage: interp.wbcMessage,
        rbcMessage: interp.rbcMessage,
        pltMessage: interp.pltMessage,
        generalMessage: interp.generalMessage,
      })),
      verificationInfo,
      laboratoryInfo,
    };
  }

  private normalizeLookupToken(value?: string): string {
    if (!value) {
      return '';
    }

    return value.replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
  }

  private getLookupTokens(value?: string): string[] {
    const normalized = this.normalizeLookupToken(value);
    if (!normalized) {
      return [];
    }

    const aliases = ReportsService.TEST_CODE_ALIASES[normalized] || [];
    return [normalized, ...aliases];
  }

  private resolveResultCategory(category?: string): TestCategoryEnum | undefined {
    const normalized = (category || '').trim().toLowerCase().replace(/\s+/g, '_');
    if (!normalized) {
      return undefined;
    }

    const categoryMap: Record<string, TestCategoryEnum> = {
      chemistry: TestCategoryEnum.CHEMISTRY,
      hematology: TestCategoryEnum.HEMATOLOGY,
      immunoassay: TestCategoryEnum.IMMUNOASSAY,
      serology: TestCategoryEnum.SEROLOGY,
      urinalysis: TestCategoryEnum.URINALYSIS,
      microbiology: TestCategoryEnum.MICROBIOLOGY,
      other: TestCategoryEnum.OTHER,
      other_tests: TestCategoryEnum.OTHER,
    };

    return categoryMap[normalized];
  }

  private normalizeUrinalysisSubcategory(subcategory?: string): string | undefined {
    const normalizedSubcategory = this.normalizeLookupToken(subcategory);

    if (!normalizedSubcategory) {
      return undefined;
    }

    if (normalizedSubcategory === 'DIPSTICKCHEMICAL' || normalizedSubcategory === 'CHEMICAL') {
      return 'Dipstick/Chemical';
    }

    if (normalizedSubcategory === 'PHYSICALEXAMINATION' || normalizedSubcategory === 'PHYSICAL') {
      return 'Physical Examination';
    }

    if (normalizedSubcategory === 'MICROSCOPIC') {
      return 'Microscopic';
    }

    return subcategory;
  }

  private inferUrinalysisSubcategory(testCode: string, panelCode?: string): string | undefined {
    const normalizedCode = this.normalizeLookupToken(testCode);
    const normalizedPanelCode = this.normalizeLookupToken(panelCode);

    const urineLikeTest =
      normalizedCode.startsWith('URINE') || normalizedCode === 'UPROTEIN' || normalizedCode === 'UPRO';

    if (!urineLikeTest && normalizedPanelCode !== 'URINE') {
      return undefined;
    }

    const physicalCodes = new Set(['URINECOLOR', 'URINECLARITY']);
    const dipstickCodes = new Set([
      'URINEPH',
      'URINESG',
      'URINEPROTEIN',
      'UPROTEIN',
      'UPRO',
      'URINEGLUCOSE',
      'URINEKETONES',
      'URINEBLOOD',
      'URINEBILI',
      'URINEURO',
      'URINENITRITE',
      'URINELE',
    ]);
    const microscopicCodes = new Set([
      'URINERBC',
      'URINEWBC',
      'URINEEPI',
      'URINECASTS',
      'URINECRYSTALS',
      'URINEBACTERIA',
    ]);

    if (physicalCodes.has(normalizedCode)) {
      return 'Physical Examination';
    }

    if (dipstickCodes.has(normalizedCode)) {
      return 'Dipstick/Chemical';
    }

    if (microscopicCodes.has(normalizedCode)) {
      return 'Microscopic';
    }

    if (normalizedPanelCode === 'URINE') {
      return 'Dipstick/Chemical';
    }

    return undefined;
  }

  private resolveUrinalysisSubcategory(
    testCode: string,
    panelCode?: string,
    subcategory?: string,
  ): string | undefined {
    return this.normalizeUrinalysisSubcategory(subcategory) || this.inferUrinalysisSubcategory(testCode, panelCode);
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
    explicitReferenceRange?: string,
    referenceRanges?: TestCatalog['referenceRanges'],
    referenceRange?: string,
  ): string | undefined {
    return resolveReferenceRange({
      age: patientAge,
      gender: patientGender,
      explicitReferenceRange,
      referenceRanges,
      simpleReferenceRange: referenceRange,
    });
  }

  /**
   * Group results by test category
   * @param results - Array of result items
   * @returns Results grouped by category with display names
   */
  private static readonly INDIVIDUAL_PAGE_TESTS = new Set([
    'UREA', 'BUN', 'CREAT', 'CREATININE', 'UA', 'URICACID',
  ]);

  groupResultsByCategory(results: ResultItemDto[]): ResultCategoryDto[] {
    const grouped = new Map<string, ResultItemDto[]>();
    const categoryOrder: string[] = [];

    for (const result of results) {
      const baseCategory = (result as any).category || TestCategoryEnum.OTHER;
      const testCode = this.normalizeLookupToken(result.testCode);
      const panelCode = result.panelCode;

      // Individually-ordered chemistry tests get their own group (separate page)
      // but still use the CLINICAL CHEMISTRY heading
      let categoryKey: string = baseCategory;
      if (baseCategory === TestCategoryEnum.CHEMISTRY && !panelCode && ReportsService.INDIVIDUAL_PAGE_TESTS.has(testCode)) {
        categoryKey = 'individual_chemistry';
      }

      if (!grouped.has(categoryKey)) {
        grouped.set(categoryKey, []);
        categoryOrder.push(categoryKey);
      }
      grouped.get(categoryKey)!.push(result);
    }

    const resultsByCategory: ResultCategoryDto[] = [];

    for (const categoryKey of categoryOrder) {
      if (!grouped.has(categoryKey)) continue;

      if (categoryKey === 'individual_chemistry') {
        resultsByCategory.push({
          category: 'individual_chemistry' as any,
          categoryDisplayName: this.formatCategoryDisplayName(TestCategoryEnum.CHEMISTRY),
          results: grouped.get(categoryKey)!,
        });
      } else {
        const category = categoryKey as TestCategoryEnum;
        resultsByCategory.push({
          category,
          categoryDisplayName: this.formatCategoryDisplayName(category),
          results: grouped.get(categoryKey)!,
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
      [TestCategoryEnum.CHEMISTRY]: 'CLINICAL CHEMISTRY',
      [TestCategoryEnum.HEMATOLOGY]: 'HEMATOLOGY',
      [TestCategoryEnum.IMMUNOASSAY]: 'IMMUNOASSAY',
      [TestCategoryEnum.SEROLOGY]: 'SEROLOGY',
      [TestCategoryEnum.URINALYSIS]: 'URINALYSIS',
      [TestCategoryEnum.MICROBIOLOGY]: 'MICROBIOLOGY',
      [TestCategoryEnum.OTHER]: 'OTHER TESTS',
    };

    return displayNames[category] || category.toUpperCase();
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
