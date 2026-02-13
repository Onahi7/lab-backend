import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Machine, MachineStatusEnum } from '../database/schemas/machine.schema';
import { MachineMaintenance } from '../database/schemas/machine-maintenance.schema';
import { CreateMachineDto } from './dto/create-machine.dto';
import { UpdateMachineDto } from './dto/update-machine.dto';
import { CreateMachineMaintenanceDto } from './dto/create-machine-maintenance.dto';

@Injectable()
export class MachinesService {
  private readonly logger = new Logger(MachinesService.name);

  constructor(
    @InjectModel(Machine.name) private machineModel: Model<Machine>,
    @InjectModel(MachineMaintenance.name)
    private machineMaintenanceModel: Model<MachineMaintenance>,
  ) {}

  /**
   * Create a new machine
   */
  async create(createMachineDto: CreateMachineDto): Promise<Machine> {
    const machine = new this.machineModel({
      ...createMachineDto,
      status: MachineStatusEnum.OFFLINE,
    });

    const savedMachine = await machine.save();
    this.logger.log(`Machine created: ${savedMachine.name}`);

    return savedMachine;
  }

  /**
   * Find all machines with optional filters
   */
  async findAll(
    status?: string,
    protocol?: string,
  ): Promise<Machine[]> {
    const query: any = {};

    if (status) {
      query.status = status;
    }

    if (protocol) {
      query.protocol = protocol;
    }

    const machines = await this.machineModel
      .find(query)
      .sort({ name: 1 })
      .exec();

    return machines;
  }

  /**
   * Find machine by ID
   */
  async findOne(id: string): Promise<Machine> {
    if (!Types.ObjectId.isValid(id)) {
      throw new NotFoundException(`Machine with ID ${id} not found`);
    }

    const machine = await this.machineModel.findById(id).exec();

    if (!machine) {
      throw new NotFoundException(`Machine with ID ${id} not found`);
    }

    return machine;
  }

  /**
   * Update machine
   */
  async update(id: string, updateMachineDto: UpdateMachineDto): Promise<Machine> {
    if (!Types.ObjectId.isValid(id)) {
      throw new NotFoundException(`Machine with ID ${id} not found`);
    }

    const machine = await this.machineModel
      .findByIdAndUpdate(id, updateMachineDto, { new: true })
      .exec();

    if (!machine) {
      throw new NotFoundException(`Machine with ID ${id} not found`);
    }

    this.logger.log(`Machine updated: ${machine.name}`);
    return machine;
  }

  /**
   * Delete machine
   */
  async remove(id: string): Promise<void> {
    if (!Types.ObjectId.isValid(id)) {
      throw new NotFoundException(`Machine with ID ${id} not found`);
    }

    const result = await this.machineModel.findByIdAndDelete(id).exec();

    if (!result) {
      throw new NotFoundException(`Machine with ID ${id} not found`);
    }

    this.logger.log(`Machine deleted: ${result.name}`);
  }

  /**
   * Update machine status
   */
  async updateStatus(id: string, status: MachineStatusEnum): Promise<Machine> {
    if (!Types.ObjectId.isValid(id)) {
      throw new NotFoundException(`Machine with ID ${id} not found`);
    }

    const machine = await this.machineModel
      .findByIdAndUpdate(
        id,
        { status, lastCommunication: new Date() },
        { new: true },
      )
      .exec();

    if (!machine) {
      throw new NotFoundException(`Machine with ID ${id} not found`);
    }

    this.logger.log(`Machine status updated: ${machine.name} - ${status}`);
    return machine;
  }

  /**
   * Update last communication timestamp
   */
  async updateLastCommunication(id: string): Promise<Machine> {
    if (!Types.ObjectId.isValid(id)) {
      throw new NotFoundException(`Machine with ID ${id} not found`);
    }

    const machine = await this.machineModel
      .findByIdAndUpdate(
        id,
        { lastCommunication: new Date() },
        { new: true },
      )
      .exec();

    if (!machine) {
      throw new NotFoundException(`Machine with ID ${id} not found`);
    }

    return machine;
  }

  /**
   * Get machine maintenance history
   */
  async getMaintenanceHistory(machineId: string): Promise<MachineMaintenance[]> {
    if (!Types.ObjectId.isValid(machineId)) {
      throw new NotFoundException(`Machine with ID ${machineId} not found`);
    }

    // Verify machine exists
    const machine = await this.machineModel.findById(machineId).exec();
    if (!machine) {
      throw new NotFoundException(`Machine with ID ${machineId} not found`);
    }

    const maintenance = await this.machineMaintenanceModel
      .find({ machineId: new Types.ObjectId(machineId) })
      .populate('performedBy', 'fullName email')
      .sort({ performedAt: -1 })
      .exec();

    return maintenance;
  }

  /**
   * Record machine maintenance
   */
  async recordMaintenance(
    createMaintenanceDto: CreateMachineMaintenanceDto,
    userId?: string,
  ): Promise<MachineMaintenance> {
    const { machineId, ...maintenanceData } = createMaintenanceDto;

    if (!machineId || !Types.ObjectId.isValid(machineId)) {
      throw new BadRequestException('Invalid machine ID');
    }

    // Verify machine exists
    const machine = await this.machineModel.findById(machineId).exec();
    if (!machine) {
      throw new NotFoundException(`Machine with ID ${machineId} not found`);
    }

    const maintenance = new this.machineMaintenanceModel({
      machineId: new Types.ObjectId(machineId),
      ...maintenanceData,
      performedBy: userId ? new Types.ObjectId(userId) : undefined,
    });

    const savedMaintenance = await maintenance.save();

    // Populate performedBy before returning
    await savedMaintenance.populate('performedBy', 'fullName email');

    this.logger.log(
      `Maintenance recorded for machine: ${machine.name} - ${maintenanceData.maintenanceType}`,
    );

    return savedMaintenance;
  }

  /**
   * Get machines by supported test code
   */
  async findByTestCode(testCode: string): Promise<Machine[]> {
    const machines = await this.machineModel
      .find({
        testsSupported: testCode,
        status: { $ne: MachineStatusEnum.OFFLINE },
      })
      .exec();

    return machines;
  }

  /**
   * Get online machines
   */
  async getOnlineMachines(): Promise<Machine[]> {
    const machines = await this.machineModel
      .find({ status: MachineStatusEnum.ONLINE })
      .exec();

    return machines;
  }
}
