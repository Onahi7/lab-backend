import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import * as net from 'net';
import { Hl7Service } from './hl7.service';
import { Machine } from '../database/schemas/machine.schema';

interface UnmatchedResult {
  machineId: string;
  machineName: string;
  protocol: string;
  rawMessage: string;
  parsedResults: any[];
  receivedAt: Date;
  position?: number;
  status: 'pending' | 'matched' | 'rejected';
}

@Injectable()
export class TcpListenerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(TcpListenerService.name);
  private servers: Map<string, net.Server> = new Map();
  private unmatchedResults: UnmatchedResult[] = [];

  constructor(
    private readonly hl7Service: Hl7Service,
    @InjectModel(Machine.name) private machineModel: Model<Machine>,
  ) {}

  async onModuleInit() {
    // Start TCP listeners for all configured machines
    await this.startAllListeners();
  }

  async onModuleDestroy() {
    // Stop all TCP listeners
    this.stopAllListeners();
  }

  /**
   * Start TCP listeners for all machines with IP/Port configured
   */
  async startAllListeners() {
    const machines = await this.machineModel.find({
      ipAddress: { $exists: true, $ne: null },
      port: { $exists: true, $ne: null },
    });

    for (const machine of machines) {
      if (machine.ipAddress && machine.port) {
        await this.startListener(
          machine._id.toString(),
          machine.name,
          machine.port,
          machine.protocol,
        );
      }
    }

    this.logger.log(`Started ${this.servers.size} TCP listeners`);
  }

  /**
   * Start TCP listener for a specific machine
   */
  async startListener(
    machineId: string,
    machineName: string,
    port: number,
    protocol: string,
  ) {
    if (this.servers.has(machineId)) {
      this.logger.warn(`Listener already running for ${machineName}`);
      return;
    }

    const server = net.createServer((socket) => {
      this.logger.log(`Connection from ${socket.remoteAddress} to ${machineName}`);

      let buffer = '';

      socket.on('data', async (data) => {
        buffer += data.toString();

        // Check for message end markers
        const hasHL7End = buffer.includes('\x1C\r'); // HL7 end marker
        const hasASTMEnd = buffer.includes('\r\n'); // ASTM end marker

        if (hasHL7End || hasASTMEnd) {
          try {
            await this.handleMessage(machineId, machineName, protocol, buffer, socket);
            buffer = ''; // Clear buffer after processing
          } catch (error: any) {
            this.logger.error(`Error processing message: ${error.message}`);
            socket.write('NAK\r\n'); // Send negative acknowledgment
          }
        }
      });

      socket.on('error', (error) => {
        this.logger.error(`Socket error for ${machineName}: ${error.message}`);
      });

      socket.on('close', () => {
        this.logger.log(`Connection closed for ${machineName}`);
      });
    });

    server.listen(port, () => {
      this.logger.log(`TCP listener started for ${machineName} on port ${port}`);
    });

    server.on('error', (error: any) => {
      this.logger.error(`Server error for ${machineName}: ${error.message}`);
    });

    this.servers.set(machineId, server);
  }

  /**
   * Handle incoming message from analyzer
   */
  private async handleMessage(
    machineId: string,
    machineName: string,
    protocol: string,
    message: string,
    socket: net.Socket,
  ) {
    this.logger.log(`Received message from ${machineName}`);

    // Parse message based on protocol
    let parsed: any;
    let ack: string;

    if (protocol === 'HL7') {
      parsed = this.hl7Service.parseHL7Message(message);
      ack = this.hl7Service.generateHL7Ack(parsed.messageControlId, 'AA');
    } else if (protocol === 'ASTM' || protocol === 'LIS2_A2') {
      parsed = this.hl7Service.parseASTMMessage(message);
      ack = this.hl7Service.generateASTMAck('ACK');
    } else {
      throw new Error(`Unsupported protocol: ${protocol}`);
    }

    // Store as unmatched result (waiting for manual matching)
    const unmatchedResult: UnmatchedResult = {
      machineId,
      machineName,
      protocol,
      rawMessage: message,
      parsedResults: parsed.results || [],
      receivedAt: new Date(),
      position: this.extractPosition(message),
      status: 'pending',
    };

    this.unmatchedResults.push(unmatchedResult);

    this.logger.log(
      `Stored unmatched result from ${machineName} - ${parsed.results?.length || 0} tests`,
    );

    // Send acknowledgment
    socket.write(ack);

    // Update machine status
    await this.machineModel.findByIdAndUpdate(machineId, {
      status: 'online',
      lastCommunication: new Date(),
    });
  }

  /**
   * Extract position/rack number from message if available
   */
  private extractPosition(message: string): number | undefined {
    // Try to extract position from message
    // This is analyzer-specific, may need customization
    const positionMatch = message.match(/Position[:\s]+(\d+)/i);
    if (positionMatch) {
      return parseInt(positionMatch[1]);
    }
    return undefined;
  }

  /**
   * Get all unmatched results
   */
  getUnmatchedResults(): UnmatchedResult[] {
    return this.unmatchedResults.filter((r) => r.status === 'pending');
  }

  /**
   * Get unmatched result by index
   */
  getUnmatchedResult(index: number): UnmatchedResult | undefined {
    return this.unmatchedResults[index];
  }

  /**
   * Match result to order
   */
  async matchResult(
    resultIndex: number,
    orderId: string,
  ): Promise<{ success: boolean; message: string }> {
    const result = this.unmatchedResults[resultIndex];

    if (!result) {
      return { success: false, message: 'Result not found' };
    }

    if (result.status !== 'pending') {
      return { success: false, message: 'Result already processed' };
    }

    try {
      // Store results using existing HL7 service
      // This will link results to the order
      const stored = await this.hl7Service['storeResults'](
        orderId as any,
        result.parsedResults,
        result.machineId,
      );

      // Mark as matched
      result.status = 'matched';

      this.logger.log(`Matched result to order ${orderId} - ${stored.length} tests stored`);

      return {
        success: true,
        message: `Successfully matched ${stored.length} test results`,
      };
    } catch (error: any) {
      this.logger.error(`Error matching result: ${error.message}`);
      return { success: false, message: error.message };
    }
  }

  /**
   * Reject/dismiss unmatched result
   */
  rejectResult(resultIndex: number): boolean {
    const result = this.unmatchedResults[resultIndex];
    if (result && result.status === 'pending') {
      result.status = 'rejected';
      return true;
    }
    return false;
  }

  /**
   * Stop all TCP listeners
   */
  stopAllListeners() {
    this.servers.forEach((server, machineId) => {
      server.close();
      this.logger.log(`Stopped listener for machine ${machineId}`);
    });
    this.servers.clear();
  }

  /**
   * Stop listener for specific machine
   */
  stopListener(machineId: string) {
    const server = this.servers.get(machineId);
    if (server) {
      server.close();
      this.servers.delete(machineId);
      this.logger.log(`Stopped listener for machine ${machineId}`);
    }
  }

  /**
   * Restart listener for specific machine
   */
  async restartListener(machineId: string) {
    this.stopListener(machineId);

    const machine = await this.machineModel.findById(machineId);
    if (machine && machine.ipAddress && machine.port) {
      await this.startListener(
        machine._id.toString(),
        machine.name,
        machine.port,
        machine.protocol,
      );
    }
  }
}
