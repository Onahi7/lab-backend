import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Logger,
  Inject,
  forwardRef,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import * as net from 'net';
import { Machine, MachineStatusEnum } from '../database/schemas/machine.schema';
import { MachineMaintenance } from '../database/schemas/machine-maintenance.schema';
import { CreateMachineDto } from './dto/create-machine.dto';
import { UpdateMachineDto } from './dto/update-machine.dto';
import { CreateMachineMaintenanceDto } from './dto/create-machine-maintenance.dto';
import { TcpListenerService } from '../hl7/tcp-listener.service';
import { RealtimeGateway } from '../realtime/realtime.gateway';

@Injectable()
export class MachinesService {
  private readonly logger = new Logger(MachinesService.name);

  constructor(
    @InjectModel(Machine.name) private machineModel: Model<Machine>,
    @InjectModel(MachineMaintenance.name)
    private machineMaintenanceModel: Model<MachineMaintenance>,
    @Inject(forwardRef(() => TcpListenerService))
    private readonly tcpListenerService: TcpListenerService,
    @Inject(forwardRef(() => RealtimeGateway))
    private readonly realtimeGateway: RealtimeGateway,
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

    // Start TCP listener if network config is provided
    if (savedMachine.ipAddress && savedMachine.port) {
      await this.tcpListenerService.startListener(
        savedMachine._id.toString(),
        savedMachine.name,
        savedMachine.port,
        savedMachine.protocol,
      );
    }

    // Notify via WebSocket
    this.realtimeGateway.notifyMachineStatusChanged(savedMachine);

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

    // Restart TCP listener if network config changed
    if (updateMachineDto.ipAddress !== undefined || updateMachineDto.port !== undefined || updateMachineDto.protocol !== undefined) {
      await this.tcpListenerService.restartListener(id);
    }

    // Notify via WebSocket
    this.realtimeGateway.notifyMachineStatusChanged(machine);

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

    // Stop TCP listener for this machine
    this.tcpListenerService.stopListener(id);

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

    // Notify via WebSocket
    this.realtimeGateway.notifyMachineStatusChanged(machine);

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

  /**
   * Test TCP connection to a machine
   */
  async testConnection(id: string): Promise<{ success: boolean; message: string; latency?: number }> {
    const machine = await this.findOne(id);

    if (!machine.ipAddress || !machine.port) {
      return { success: false, message: 'No IP address or port configured for this machine' };
    }

    return new Promise((resolve) => {
      const start = Date.now();
      const socket = new net.Socket();
      socket.setTimeout(5000);

      socket.connect(machine.port!, machine.ipAddress!, () => {
        const latency = Date.now() - start;
        socket.destroy();
        this.logger.log(`Connection test successful for machine ${machine.name}: ${latency}ms`);
        resolve({ success: true, message: `Connection successful (${latency}ms)`, latency });
      });

      socket.on('error', (err: Error) => {
        socket.destroy();
        resolve({ success: false, message: err.message });
      });

      socket.on('timeout', () => {
        socket.destroy();
        resolve({ success: false, message: 'Connection timed out after 5 seconds' });
      });
    });
  }
}
