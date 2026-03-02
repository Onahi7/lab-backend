import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import * as net from 'net';
import { CommunicationLog } from '../database/schemas/communication-log.schema';
import { Result } from '../database/schemas/result.schema';
import { Order } from '../database/schemas/order.schema';
import { OrderTest } from '../database/schemas/order-test.schema';
import { Machine } from '../database/schemas/machine.schema';
import { Patient } from '../database/schemas/patient.schema';

interface ParsedHL7Message {
  messageType: string;
  messageControlId: string;
  patientId?: string;
  orderId?: string;
  results?: Array<{
    testCode: string;
    testName: string;
    value: string;
    unit?: string;
    referenceRange?: string;
    abnormalFlag?: string;
  }>;
}

interface ParsedASTMMessage {
  recordType: string;
  patientId?: string;
  orderId?: string;
  results?: Array<{
    testCode: string;
    value: string;
    unit?: string;
    referenceRange?: string;
  }>;
}

@Injectable()
export class Hl7Service {
  private readonly logger = new Logger(Hl7Service.name);

  constructor(
    @InjectModel(CommunicationLog.name)
    private communicationLogModel: Model<CommunicationLog>,
    @InjectModel(Result.name)
    private resultModel: Model<Result>,
    @InjectModel(Order.name)
    private orderModel: Model<Order>,
    @InjectModel(OrderTest.name)
    private orderTestModel: Model<OrderTest>,
    @InjectModel(Machine.name)
    private machineModel: Model<Machine>,
    @InjectModel(Patient.name)
    private patientModel: Model<Patient>,
  ) {}

  /**
   * Parse HL7 message
   */
  parseHL7Message(message: string): ParsedHL7Message {
    const segments = message.split('\r').filter((s) => s.trim());
    const parsed: ParsedHL7Message = {
      messageType: '',
      messageControlId: '',
      results: [],
    };

    for (const segment of segments) {
      const fields = segment.split('|');
      const segmentType = fields[0];

      if (segmentType === 'MSH') {
        // Message Header
        parsed.messageType = fields[8] || '';
        parsed.messageControlId = fields[9] || '';
      } else if (segmentType === 'PID') {
        // Patient Identification
        parsed.patientId = fields[3] || '';
      } else if (segmentType === 'OBR') {
        // Observation Request
        parsed.orderId = fields[2] || fields[3] || '';
      } else if (segmentType === 'OBX') {
        // Observation Result
        const result = {
          testCode: fields[3]?.split('^')[0] || '',
          testName: fields[3]?.split('^')[1] || '',
          value: fields[5] || '',
          unit: fields[6] || '',
          referenceRange: fields[7] || '',
          abnormalFlag: fields[8] || '',
        };
        if (!parsed.results) parsed.results = [];
        parsed.results.push(result);
      }
    }

    return parsed;
  }

  /**
   * Parse ASTM message
   */
  parseASTMMessage(message: string): ParsedASTMMessage {
    const records = message.split('\r').filter((r) => r.trim());
    const parsed: ParsedASTMMessage = {
      recordType: '',
      results: [],
    };

    for (const record of records) {
      const fields = record.split('|');
      const recordType = fields[0];

      if (recordType === 'H') {
        // Header Record
        parsed.recordType = 'ASTM';
      } else if (recordType === 'P') {
        // Patient Record
        parsed.patientId = fields[2] || '';
      } else if (recordType === 'O') {
        // Order Record
        parsed.orderId = fields[2] || '';
      } else if (recordType === 'R') {
        // Result Record
        const result = {
          testCode: fields[2]?.split('^')[3] || '',
          value: fields[3] || '',
          unit: fields[4] || '',
          referenceRange: fields[5] || '',
        };
        if (!parsed.results) parsed.results = [];
        parsed.results.push(result);
      }
    }

    return parsed;
  }

  /**
   * Parse LIS2-A2 message (similar to ASTM)
   */
  parseLIS2A2Message(message: string): ParsedASTMMessage {
    // LIS2-A2 is similar to ASTM, reuse parser
    return this.parseASTMMessage(message);
  }

  /**
   * Generate HL7 ACK message
   */
  generateHL7Ack(messageControlId: string, status: 'AA' | 'AE' | 'AR'): string {
    const timestamp = new Date()
      .toISOString()
      .replace(/[-:]/g, '')
      .replace('T', '')
      .substring(0, 14);
    
    const ack = [
      `MSH|^~\\&|LIS|LAB|ANALYZER|LAB|${timestamp}||ACK|${messageControlId}|P|2.5`,
      `MSA|${status}|${messageControlId}`,
    ].join('\r');

    return ack + '\r';
  }

  /**
   * Generate ASTM ACK message
   */
  generateASTMAck(status: 'ACK' | 'NAK'): string {
    return `${status}\r`;
  }

  /**
   * Process HL7 message
   */
  async processHL7Message(
    message: string,
    machineId: string,
  ): Promise<{ ack: string; results: any[] }> {
    this.logger.log(`Processing HL7 message from machine ${machineId}`);

    // Log incoming message
    const logEntry = await this.logCommunication(
      machineId,
      'HL7',
      'inbound',
      'ORU',
      message,
      'processing',
    );

    try {
      // Parse message
      const parsed = this.parseHL7Message(message);

      // Validate message
      if (!parsed.messageControlId) {
        throw new BadRequestException('Invalid HL7 message: missing control ID');
      }

      // Find order
      const order = await this.findOrder(parsed.orderId, parsed.patientId);
      if (!order) {
        this.logger.warn(
          `Order not found for HL7 message: ${parsed.orderId || parsed.patientId}`,
        );
        await this.updateCommunicationLog(logEntry._id, 'failed', 'Order not found');
        return {
          ack: this.generateHL7Ack(parsed.messageControlId, 'AE'),
          results: [],
        };
      }

      // Store results
      const results = await this.storeResults(order._id, parsed.results || [], machineId);

      // Update machine status
      await this.updateMachineStatus(machineId, 'online');

      // Update log
      await this.updateCommunicationLog(logEntry._id, 'success');

      // Generate ACK
      const ack = this.generateHL7Ack(parsed.messageControlId, 'AA');

      this.logger.log(
        `Successfully processed HL7 message: ${results.length} results stored`,
      );

      return { ack, results };
    } catch (error: any) {
      this.logger.error(`Error processing HL7 message: ${error.message}`);
      await this.updateCommunicationLog(logEntry._id, 'failed', error.message);
      throw error;
    }
  }

  /**
   * Process ASTM message
   */
  async processASTMMessage(
    message: string,
    machineId: string,
  ): Promise<{ ack: string; results: any[] }> {
    this.logger.log(`Processing ASTM message from machine ${machineId}`);

    // Log incoming message
    const logEntry = await this.logCommunication(
      machineId,
      'ASTM',
      'inbound',
      'RESULT',
      message,
      'processing',
    );

    try {
      // Parse message
      const parsed = this.parseASTMMessage(message);

      // Find order
      const order = await this.findOrder(parsed.orderId, parsed.patientId);
      if (!order) {
        this.logger.warn(
          `Order not found for ASTM message: ${parsed.orderId || parsed.patientId}`,
        );
        await this.updateCommunicationLog(logEntry._id, 'failed', 'Order not found');
        return { ack: this.generateASTMAck('NAK'), results: [] };
      }

      // Store results
      const results = await this.storeResults(order._id, parsed.results || [], machineId);

      // Update machine status
      await this.updateMachineStatus(machineId, 'online');

      // Update log
      await this.updateCommunicationLog(logEntry._id, 'success');

      // Generate ACK
      const ack = this.generateASTMAck('ACK');

      this.logger.log(
        `Successfully processed ASTM message: ${results.length} results stored`,
      );

      return { ack, results };
    } catch (error: any) {
      this.logger.error(`Error processing ASTM message: ${error.message}`);
      await this.updateCommunicationLog(logEntry._id, 'failed', error.message);
      throw error;
    }
  }

  /**
   * Process LIS2-A2 message
   */
  async processLIS2A2Message(
    message: string,
    machineId: string,
  ): Promise<{ ack: string; results: any[] }> {
    this.logger.log(`Processing LIS2-A2 message from machine ${machineId}`);
    // LIS2-A2 processing is similar to ASTM
    return this.processASTMMessage(message, machineId);
  }

  /**
   * Find order by order ID or patient ID
   */
  private async findOrder(
    orderId?: string,
    patientId?: string,
  ): Promise<Order | null> {
    if (orderId) {
      return this.orderModel.findOne({ orderNumber: orderId });
    }
    if (patientId) {
      // Find most recent pending order for patient
      return this.orderModel
        .findOne({
          patientId: new Types.ObjectId(patientId),
          status: { $in: ['collected', 'processing'] },
        })
        .sort({ createdAt: -1 });
    }
    return null;
  }

  /**
   * Store results in database
   */
  private async storeResults(
    orderId: Types.ObjectId,
    results: any[],
    machineId: string,
  ): Promise<Result[]> {
    const storedResults: Result[] = [];

    for (const result of results) {
      const newResult = new this.resultModel({
        orderId,
        testCode: result.testCode,
        testName: result.testName || result.testCode,
        value: result.value,
        unit: result.unit,
        referenceRange: result.referenceRange,
        flag: this.mapAbnormalFlag(result.abnormalFlag),
        status: 'preliminary',
        source: 'automated',
        machineId: new Types.ObjectId(machineId),
        resultedAt: new Date(),
      });

      const saved = await newResult.save();
      storedResults.push(saved);
    }

    // Update order status to processing if not already
    await this.orderModel.findByIdAndUpdate(orderId, {
      $set: { status: 'processing' },
    });

    return storedResults;
  }

  /**
   * Map HL7 abnormal flag to system flag
   */
  private mapAbnormalFlag(abnormalFlag?: string): string {
    if (!abnormalFlag) return 'normal';
    
    const flag = abnormalFlag.toUpperCase();
    if (flag.includes('LL') || flag.includes('CRITICAL LOW')) return 'critical_low';
    if (flag.includes('HH') || flag.includes('CRITICAL HIGH')) return 'critical_high';
    if (flag.includes('L') || flag.includes('LOW')) return 'low';
    if (flag.includes('H') || flag.includes('HIGH')) return 'high';
    
    return 'normal';
  }

  /**
   * Update machine status
   */
  private async updateMachineStatus(
    machineId: string,
    status: string,
  ): Promise<void> {
    await this.machineModel.findByIdAndUpdate(machineId, {
      $set: {
        status,
        lastCommunication: new Date(),
      },
    });
  }

  /**
   * Log communication
   */
  private async logCommunication(
    machineId: string,
    protocol: string,
    direction: string,
    messageType: string,
    message: string,
    status: string,
    errorMessage?: string,
  ): Promise<CommunicationLog> {
    const log = new this.communicationLogModel({
      machineId: new Types.ObjectId(machineId),
      protocol,
      direction,
      messageType,
      message: message.substring(0, 5000), // Truncate to 5000 chars
      status,
      errorMessage,
      processingTime: 0,
    });

    return log.save();
  }

  /**
   * Update communication log
   */
  private async updateCommunicationLog(
    logId: Types.ObjectId,
    status: string,
    errorMessage?: string,
  ): Promise<void> {
    await this.communicationLogModel.findByIdAndUpdate(logId, {
      $set: {
        status,
        errorMessage,
        processingTime: Date.now() - logId.getTimestamp().getTime(),
      },
    });
  }

  /**
   * Get communication logs with filters
   */
  async getCommunicationLogs(filters: {
    machineId?: string;
    protocol?: string;
    status?: string;
    startDate?: Date;
    endDate?: Date;
    page?: number;
    limit?: number;
  }): Promise<{ logs: CommunicationLog[]; total: number }> {
    const query: any = {};

    if (filters.machineId) {
      query.machineId = new Types.ObjectId(filters.machineId);
    }
    if (filters.protocol) {
      query.protocol = filters.protocol;
    }
    if (filters.status) {
      query.status = filters.status;
    }
    if (filters.startDate || filters.endDate) {
      query.createdAt = {};
      if (filters.startDate) {
        query.createdAt.$gte = filters.startDate;
      }
      if (filters.endDate) {
        query.createdAt.$lte = filters.endDate;
      }
    }

    const page = filters.page || 1;
    const limit = filters.limit || 50;
    const skip = (page - 1) * limit;

    const [logs, total] = await Promise.all([
      this.communicationLogModel
        .find(query)
        .populate('machineId', 'name model')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .exec(),
      this.communicationLogModel.countDocuments(query),
    ]);

    return { logs, total };
  }

  /**
   * Get communication log by ID
   */
  async getCommunicationLogById(id: string): Promise<CommunicationLog> {
    if (!Types.ObjectId.isValid(id)) {
      throw new BadRequestException('Invalid log ID');
    }

    const log = await this.communicationLogModel
      .findById(id)
      .populate('machineId', 'name model')
      .exec();

    if (!log) {
      throw new BadRequestException('Communication log not found');
    }

    return log;
  }

  /**
   * Generate HL7 ORM^O01 order message for sending to analyzer
   */
  generateHL7OrderMessage(
    order: Order & { patientId: Patient },
    tests: OrderTest[],
  ): string {
    const timestamp = new Date()
      .toISOString()
      .replace(/[-:]/g, '')
      .replace('T', '')
      .substring(0, 14);

    const patient = order.patientId as unknown as Patient;
    const segments = [
      `MSH|^~\\&|LIS|LAB|ANALYZER|LAB|${timestamp}||ORM^O01|${order.orderNumber}|P|2.5`,
      `PID|1||${patient.patientId}||${patient.lastName}^${patient.firstName}||${patient.gender}|||${patient.address || ''}`,
      `PV1|1|O`,
    ];

    tests.forEach((test, idx) => {
      segments.push(
        `ORC|NW|${order.orderNumber}|||${order.priority === 'stat' ? 'S' : 'R'}`,
        `OBR|${idx + 1}|${order.orderNumber}||${test.testCode}^${test.testName}|||${timestamp}`,
      );
    });

    return segments.join('\r') + '\r';
  }

  /**
   * Generate ASTM order message for sending to analyzer
   */
  generateASTMOrderMessage(
    order: Order & { patientId: Patient },
    tests: OrderTest[],
  ): string {
    const patient = order.patientId as unknown as Patient;
    const records = [
      `H|\\^&|||LIS|||||LAB||P|1`,
      `P|1||${patient.patientId}||${patient.lastName}^${patient.firstName}||${patient.gender}`,
    ];

    tests.forEach((test, idx) => {
      records.push(
        `O|${idx + 1}|${order.orderNumber}||^^^${test.testCode}|${order.priority === 'stat' ? 'S' : 'R'}`,
      );
    });

    records.push('L|1|N');
    return records.join('\r') + '\r';
  }

  /**
   * Send order to a machine via TCP
   */
  async sendOrderToMachine(
    orderId: string,
    machineId: string,
  ): Promise<{ success: boolean; message: string }> {
    // Validate IDs
    if (!Types.ObjectId.isValid(orderId) || !Types.ObjectId.isValid(machineId)) {
      throw new BadRequestException('Invalid order or machine ID');
    }

    const machine = await this.machineModel.findById(machineId).exec();
    if (!machine) {
      throw new BadRequestException('Machine not found');
    }
    if (!machine.ipAddress || !machine.port) {
      throw new BadRequestException('Machine has no IP address or port configured');
    }

    // Get order with patient populated
    const order = await this.orderModel
      .findById(orderId)
      .populate('patientId')
      .exec() as (Order & { patientId: Patient }) | null;
    if (!order) {
      throw new BadRequestException('Order not found');
    }

    // Get order tests
    const tests = await this.orderTestModel
      .find({ orderId: new Types.ObjectId(orderId) })
      .exec();
    if (tests.length === 0) {
      throw new BadRequestException('No tests found for this order');
    }

    // Generate message based on machine protocol
    let message: string;
    if (machine.protocol === 'HL7') {
      message = this.generateHL7OrderMessage(order, tests);
    } else if (machine.protocol === 'ASTM' || machine.protocol === 'LIS2_A2') {
      message = this.generateASTMOrderMessage(order, tests);
    } else {
      throw new BadRequestException(`Protocol ${machine.protocol} does not support outbound orders`);
    }

    // Log outbound communication
    const logEntry = await this.logCommunication(
      machineId,
      machine.protocol,
      'outbound',
      'ORM',
      message,
      'processing',
    );

    // Send via TCP
    return new Promise((resolve) => {
      const socket = new net.Socket();
      socket.setTimeout(10000);

      socket.connect(machine.port!, machine.ipAddress!, () => {
        socket.write(message);
        this.logger.log(`Order ${order.orderNumber} sent to ${machine.name}`);
      });

      let response = '';

      socket.on('data', (data) => {
        response += data.toString();
        // Check if we received an ACK
        if (response.includes('AA') || response.includes('ACK') || response.includes('MSA')) {
          socket.destroy();
          this.updateCommunicationLog(logEntry._id, 'success');
          this.updateMachineStatus(machineId, 'online');
          resolve({
            success: true,
            message: `Order ${order.orderNumber} sent successfully to ${machine.name}`,
          });
        }
      });

      socket.on('error', (err: Error) => {
        socket.destroy();
        this.updateCommunicationLog(logEntry._id, 'failed', err.message);
        resolve({ success: false, message: `Connection error: ${err.message}` });
      });

      socket.on('timeout', () => {
        socket.destroy();
        // Timeout might still be OK if message was sent
        this.updateCommunicationLog(logEntry._id, 'success', 'No ACK received (timeout)');
        resolve({
          success: true,
          message: `Order sent to ${machine.name} (no ACK received within timeout)`,
        });
      });
    });
  }
}
