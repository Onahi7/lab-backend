import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Result, ResultFlagEnum, ResultStatusEnum } from '../database/schemas/result.schema';
import { Order } from '../database/schemas/order.schema';
import { Patient } from '../database/schemas/patient.schema';
import { TestCatalog } from '../database/schemas/test-catalog.schema';
import { UserRoleEnum } from '../database/schemas/user-role.schema';
import { CreateResultDto } from './dto/create-result.dto';
import { UpdateResultDto } from './dto/update-result.dto';
import { AmendResultDto } from './dto/amend-result.dto';
import { RealtimeGateway } from '../realtime/realtime.gateway';
import { resolveReferenceRange } from '../common/utils/reference-range-resolver';

@Injectable()
export class ResultsService {
  constructor(
    @InjectModel(Result.name) private resultModel: Model<Result>,
    @InjectModel(Order.name) private orderModel: Model<Order>,
    @InjectModel(Patient.name) private patientModel: Model<Patient>,
    @InjectModel(TestCatalog.name) private testCatalogModel: Model<TestCatalog>,
    private realtimeGateway: RealtimeGateway,
  ) {}

  private async resolveReferenceRangeForResult(
    orderId: Types.ObjectId,
    testCode: string,
    explicitReferenceRange?: string,
  ): Promise<string | undefined> {
    if (explicitReferenceRange) {
      return explicitReferenceRange;
    }

    const order = await this.orderModel
      .findById(orderId)
      .select('patientId')
      .lean();

    if (!order?.patientId) {
      return undefined;
    }

    const [patient, testCatalog] = await Promise.all([
      this.patientModel.findById(order.patientId).select('age gender').lean(),
      this.testCatalogModel.findOne({ code: testCode }).select('referenceRange referenceRanges').lean(),
    ]);

    if (!patient || !testCatalog) {
      return undefined;
    }

    return resolveReferenceRange({
      age: patient.age,
      gender: patient.gender as any,
      referenceRanges: testCatalog.referenceRanges,
      simpleReferenceRange: testCatalog.referenceRange,
    });
  }

  /**
   * Calculate result flag based on value and reference range
   * @param value - The test result value
   * @param referenceRange - The reference range (e.g., "12-16" or "< 5.0")
   * @returns The calculated flag
   */
  calculateFlag(value: string, referenceRange?: string): ResultFlagEnum {
    if (!referenceRange) {
      return ResultFlagEnum.NORMAL;
    }

    const numericValue = parseFloat(value);
    if (isNaN(numericValue)) {
      return ResultFlagEnum.NORMAL;
    }

    // Parse reference range
    // Formats: "12-16", "< 5.0", "> 100", "12.5 - 16.5"
    const rangeMatch = referenceRange.match(/(\d+\.?\d*)\s*-\s*(\d+\.?\d*)/);
    if (rangeMatch) {
      const low = parseFloat(rangeMatch[1]);
      const high = parseFloat(rangeMatch[2]);

      // Define critical thresholds (30% beyond normal range)
      const range = high - low;
      const criticalLowThreshold = low - range * 0.3;
      const criticalHighThreshold = high + range * 0.3;

      if (numericValue < criticalLowThreshold) {
        return ResultFlagEnum.CRITICAL_LOW;
      } else if (numericValue < low) {
        return ResultFlagEnum.LOW;
      } else if (numericValue > criticalHighThreshold) {
        return ResultFlagEnum.CRITICAL_HIGH;
      } else if (numericValue > high) {
        return ResultFlagEnum.HIGH;
      } else {
        return ResultFlagEnum.NORMAL;
      }
    }

    // Handle "< X" format
    const lessThanMatch = referenceRange.match(/<\s*(\d+\.?\d*)/);
    if (lessThanMatch) {
      const threshold = parseFloat(lessThanMatch[1]);
      if (numericValue >= threshold) {
        return ResultFlagEnum.HIGH;
      }
      return ResultFlagEnum.NORMAL;
    }

    // Handle "> X" format
    const greaterThanMatch = referenceRange.match(/>\s*(\d+\.?\d*)/);
    if (greaterThanMatch) {
      const threshold = parseFloat(greaterThanMatch[1]);
      if (numericValue <= threshold) {
        return ResultFlagEnum.LOW;
      }
      return ResultFlagEnum.NORMAL;
    }

    return ResultFlagEnum.NORMAL;
  }

  private isNumericReferenceRange(referenceRange?: string): boolean {
    if (!referenceRange) {
      return false;
    }

    const normalized = referenceRange.trim();
    if (!normalized) {
      return false;
    }

    if (/\d+\.?\d*\s*-\s*\d+\.?\d*/.test(normalized)) {
      return true;
    }

    if (/^(<|>|<=|>=|≤|≥)\s*\d+\.?\d*$/.test(normalized)) {
      return true;
    }

    return false;
  }

  private isNumericValue(value: string): boolean {
    if (value === undefined || value === null) {
      return false;
    }

    const numericPattern = /^-?\d*\.?\d+$/;
    return numericPattern.test(String(value).trim());
  }

  /**
   * Create a new result (manual entry)
   */
  async create(
    createResultDto: CreateResultDto,
    userId?: string,
    userRoles: string[] = [],
  ): Promise<Result> {
    const isReceptionistEntry = userRoles.includes(UserRoleEnum.RECEPTIONIST);
    const orderObjectId = new Types.ObjectId(createResultDto.orderId);
    const resolvedReferenceRange = await this.resolveReferenceRangeForResult(
      orderObjectId,
      createResultDto.testCode,
      isReceptionistEntry ? undefined : createResultDto.referenceRange,
    );

    // Calculate flag if not provided
    const flag =
      createResultDto.flag ||
      this.calculateFlag(createResultDto.value, resolvedReferenceRange);

    const userObjectId = userId ? new Types.ObjectId(userId) : undefined;

    const result = new this.resultModel({
      ...createResultDto,
      orderId: orderObjectId,
      orderTestId: createResultDto.orderTestId
        ? new Types.ObjectId(createResultDto.orderTestId)
        : undefined,
      referenceRange: resolvedReferenceRange,
      flag,
      status: ResultStatusEnum.VERIFIED, // Auto-verify all results
      resultedAt: new Date(),
      resultedBy: userObjectId,
      verifiedAt: new Date(), // Set verification timestamp
      verifiedBy: userObjectId, // Set verifier to the same user who entered it
    });

    const savedResult = await result.save();

    // Emit real-time event
    this.realtimeGateway.notifyResultCreated(savedResult);

    return savedResult;
  }

  /**
   * Find all results with optional filters
   */
  async findAll(filters?: {
    orderId?: string;
    testCode?: string;
    status?: ResultStatusEnum;
    flag?: ResultFlagEnum;
    page?: number;
    limit?: number;
  }): Promise<{ results: Result[]; total: number; page: number; limit: number }> {
    const page = filters?.page || 1;
    const limit = filters?.limit || 10;
    const skip = (page - 1) * limit;

    const query: any = {};

    if (filters?.orderId) {
      query.orderId = new Types.ObjectId(filters.orderId);
    }

    if (filters?.testCode) {
      query.testCode = filters.testCode;
    }

    if (filters?.status) {
      query.status = filters.status;
    }

    if (filters?.flag) {
      query.flag = filters.flag;
    }

    const [results, total] = await Promise.all([
      this.resultModel
        .find(query)
        .populate('orderId', 'orderNumber patientId')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean()
        .exec(),
      this.resultModel.countDocuments(query).exec(),
    ]);

    return { results: results as unknown as Result[], total, page, limit };
  }

  /**
   * Find result by ID
   */
  async findOne(id: string): Promise<Result> {
    if (!Types.ObjectId.isValid(id)) {
      throw new BadRequestException('Invalid result ID');
    }

    const result = await this.resultModel
      .findById(id)
      .populate('orderId', 'orderNumber patientId')
      .populate('orderTestId')
      .populate('resultedBy', 'fullName email')
      .populate('verifiedBy', 'fullName email')
      .populate('amendedFrom')
      .exec();

    if (!result) {
      throw new NotFoundException(`Result with ID ${id} not found`);
    }

    return result;
  }

  /**
   * Update a result
   */
  async update(
    id: string,
    updateResultDto: UpdateResultDto,
  ): Promise<Result> {
    if (!Types.ObjectId.isValid(id)) {
      throw new BadRequestException('Invalid result ID');
    }

    const result = await this.resultModel.findById(id).exec();
    if (!result) {
      throw new NotFoundException(`Result with ID ${id} not found`);
    }

    // Recalculate flag if value or reference range changed
    if (updateResultDto.value || updateResultDto.referenceRange) {
      const value = updateResultDto.value || result.value;
      const referenceRange =
        updateResultDto.referenceRange ||
        result.referenceRange ||
        (await this.resolveReferenceRangeForResult(result.orderId, result.testCode));

      if (!updateResultDto.referenceRange && referenceRange && !result.referenceRange) {
        updateResultDto.referenceRange = referenceRange;
      }

      updateResultDto.flag = this.calculateFlag(value, referenceRange);
    }

    Object.assign(result, updateResultDto);
    return result.save();
  }

  /**
   * Verify a result
   */
  async verify(id: string, userId?: string): Promise<Result> {
    if (!Types.ObjectId.isValid(id)) {
      throw new BadRequestException('Invalid result ID');
    }

    const result = await this.resultModel.findById(id).exec();
    if (!result) {
      throw new NotFoundException(`Result with ID ${id} not found`);
    }

    if (result.status === ResultStatusEnum.VERIFIED) {
      throw new BadRequestException('Result is already verified');
    }

    result.status = ResultStatusEnum.VERIFIED;
    result.verifiedAt = new Date();
    result.verifiedBy = userId ? new Types.ObjectId(userId) : undefined;

    const savedResult = await result.save();

    // Emit real-time event
    this.realtimeGateway.notifyResultVerified(savedResult);

    return savedResult;
  }

  /**
   * Amend a result with reason tracking
   */
  async amend(
    id: string,
    amendResultDto: AmendResultDto,
    userId?: string,
  ): Promise<Result> {
    if (!Types.ObjectId.isValid(id)) {
      throw new BadRequestException('Invalid result ID');
    }

    const originalResult = await this.resultModel.findById(id).exec();
    if (!originalResult) {
      throw new NotFoundException(`Result with ID ${id} not found`);
    }

    // Create new result with amended data
    const amendedResult = new this.resultModel({
      orderId: originalResult.orderId,
      orderTestId: originalResult.orderTestId,
      testCode: originalResult.testCode,
      testName: originalResult.testName,
      value: amendResultDto.newValue,
      unit: originalResult.unit,
      referenceRange: originalResult.referenceRange,
      flag: this.calculateFlag(
        amendResultDto.newValue,
        originalResult.referenceRange,
      ),
      status: ResultStatusEnum.AMENDED,
      comments: originalResult.comments,
      resultedAt: new Date(),
      resultedBy: userId ? new Types.ObjectId(userId) : undefined,
      amendedFrom: originalResult._id,
      amendmentReason: amendResultDto.reason,
    });

    return amendedResult.save();
  }

  /**
   * Get results pending verification
   */
  async findPendingVerification(
    page: number = 1,
    limit: number = 10,
  ): Promise<{ results: Result[]; total: number; page: number; limit: number }> {
    return this.findAll({
      status: ResultStatusEnum.PRELIMINARY,
      page,
      limit,
    });
  }

  /**
   * Get critical results
   */
  async findCritical(
    page: number = 1,
    limit: number = 10,
  ): Promise<{ results: Result[]; total: number; page: number; limit: number }> {
    const skip = (page - 1) * limit;

    const query = {
      flag: {
        $in: [ResultFlagEnum.CRITICAL_LOW, ResultFlagEnum.CRITICAL_HIGH],
      },
    };

    const [results, total] = await Promise.all([
      this.resultModel
        .find(query)
        .populate('orderId', 'orderNumber patientId')
        .populate('resultedBy', 'fullName email')
        .populate('verifiedBy', 'fullName email')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .exec(),
      this.resultModel.countDocuments(query).exec(),
    ]);

    return { results, total, page, limit };
  }

  /**
   * Delete a result (admin only)
   */
  async remove(id: string): Promise<void> {
    if (!Types.ObjectId.isValid(id)) {
      throw new BadRequestException('Invalid result ID');
    }

    const result = await this.resultModel.findByIdAndDelete(id).exec();
    if (!result) {
      throw new NotFoundException(`Result with ID ${id} not found`);
    }
  }
}
