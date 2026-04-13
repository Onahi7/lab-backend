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
   * Generate a PowerShell bridge script for a machine
   * This script runs on a lab laptop to bridge the Z52 analyzer
   * to the cloud backend without needing Node.js installed.
   */
  generateBridgeScript(machineId: string): string {
    const backendBaseUrl = process.env.BACKEND_URL || 'https://carefam-lab-1e0cbe42a3ac.herokuapp.com';
    const endpointUrl = `${backendBaseUrl}/hl7/machine-receive`;

    return `<#
.SYNOPSIS
  HARBOUR LIS TCP Bridge for Analyzer
.DESCRIPTION
  Receives HL7 results from the analyzer over TCP/MLLP and
  forwards them to the HARBOUR LIS backend. No Node.js needed.
  Just right-click -> Run with PowerShell.
.NOTES
  Generated by HARBOUR LIS - do not edit manually
#>

# ============ CONFIGURATION (auto-generated) ============
$LISTEN_PORT    = 10001
$MACHINE_ID     = "${machineId}"
$BACKEND_URL    = "${endpointUrl}"
$PROTOCOL       = "HL7"

# ============ DO NOT EDIT BELOW ============

$MLLP_START = [char]0x0B
$MLLP_END1  = [char]0x1C
$MLLP_END2  = [char]0x0D

Write-Host ""
Write-Host "============================================" -ForegroundColor Cyan
Write-Host "  HARBOUR LIS - TCP Bridge for Analyzer" -ForegroundColor Cyan
Write-Host "============================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "  Listening on port : $LISTEN_PORT" -ForegroundColor Yellow
Write-Host "  Machine ID        : $MACHINE_ID" -ForegroundColor Yellow
Write-Host "  Forwarding to     : $BACKEND_URL" -ForegroundColor Yellow
Write-Host "  Protocol          : $PROTOCOL" -ForegroundColor Yellow
Write-Host ""
Write-Host "  Waiting for analyzer connection..." -ForegroundColor Green
Write-Host "  (Press Ctrl+C to stop)" -ForegroundColor DarkGray
Write-Host ""

# Open firewall rule for this port
try {
    $ruleName = "HARBOUR LIS Bridge - Port $LISTEN_PORT"
    $existing = Get-NetFirewallRule -DisplayName $ruleName -ErrorAction SilentlyContinue
    if (-not $existing) {
        New-NetFirewallRule -DisplayName $ruleName -Direction Inbound -Protocol TCP -LocalPort $LISTEN_PORT -Action Allow | Out-Null
        Write-Host "[FIREWALL] Opened port $LISTEN_PORT" -ForegroundColor Green
    }
} catch {
    Write-Host "[FIREWALL] Could not auto-open port (run as admin if needed)" -ForegroundColor DarkGray
}

$endpoint = New-Object System.Net.IPEndPoint([System.Net.IPAddress]::Any, $LISTEN_PORT)
$listener = New-Object System.Net.Sockets.TcpListener $endpoint
$listener.Start()

function Send-MllpAck {
    param($socket, $ackType)
    $timestamp = (Get-Date).ToString("yyyyMMddHHmmss")
    $ackMsg = "MSH|^~\\&|LIS|LAB|Z52|Zybio|$timestamp||ACK|ACK001|P|2.0\`rMSA|$ackType|ACK001\`r"
    $ackBytes = [System.Text.Encoding]::ASCII.GetBytes("\$MLLP_START\$ackMsg\$MLLP_END1\$MLLP_END2")
    $socket.Send($ackBytes) | Out-Null
}

function Send-ToBackend {
    param($cleanMessage)
    try {
        $headers = @{ "x-machine-id" = $MACHINE_ID; "Content-Type" = "application/json" }
        $body = @{ message = $cleanMessage; protocol = $PROTOCOL } | ConvertTo-Json -Compress
        $response = Invoke-RestMethod -Uri $BACKEND_URL -Method Post -Body $body -ContentType "application/json" -Headers @{"x-machine-id"=$MACHINE_ID} -TimeoutSec 15
        if ($response.success) {
            Write-Host "[FWD] Success - $($response.resultsStored) result(s) stored" -ForegroundColor Green
            return $true
        } else {
            Write-Host "[FWD] Backend error: $($response.message)" -ForegroundColor Red
            return $false
        }
    } catch {
        Write-Host "[ERR] Forward failed: $($_.Exception.Message)" -ForegroundColor Red
        return $false
    }
}

try {
    while ($true) {
        if ($listener.Pending()) {
            $client = $listener.AcceptTcpClient()
            $remoteEP = $client.Client.RemoteEndPoint
            Write-Host "[CONNECT] $remoteEP" -ForegroundColor Cyan

            $stream = $client.GetStream()
            $buffer = New-Object System.Text.StringBuilder

            while ($client.Connected) {
                if ($stream.DataAvailable) {
                    $readBuffer = New-Object byte[] 4096
                    $bytesRead = $stream.Read($readBuffer, 0, $readBuffer.Length)
                    $chunk = [System.Text.Encoding]::ASCII.GetString($readBuffer, 0, $bytesRead)
                    [void]$buffer.Append($chunk)

                    $data = $buffer.ToString()

                    if ($data.Contains("\$MLLP_END1\$MLLP_END2")) {
                        Write-Host "[RECV] $($data.Length) bytes from $remoteEP" -ForegroundColor Yellow

                        $clean = $data.TrimStart($MLLP_START).TrimEnd("\$MLLP_END1\$MLLP_END2").Trim()

                        $preview = if ($clean.Length -gt 200) { $clean.Substring(0, 200) + "..." } else { $clean }
                        Write-Host "[MSG] $preview" -ForegroundColor DarkGray

                        $success = Send-ToBackend -cleanMessage $clean

                        if ($success) {
                            Send-MllpAck -socket $client.Client -ackType "AA"
                            Write-Host "[ACK] Sent AA (accept)" -ForegroundColor Green
                        } else {
                            Send-MllpAck -socket $client.Client -ackType "AE"
                            Write-Host "[NAK] Sent AE (error)" -ForegroundColor Red
                        }

                        [void]$buffer.Clear()
                    }
                }
                Start-Sleep -Milliseconds 100
            }

            Write-Host "[CLOSE] $remoteEP" -ForegroundColor DarkGray
            $client.Close()
        }
        Start-Sleep -Milliseconds 500
    }
} finally {
    $listener.Stop()
    Write-Host "Bridge stopped." -ForegroundColor Red
}
`;
  }

  /**
   * Test connection to a machine.
   * Checks two things:
   * 1. Is the TCP listener running on the configured port? (backend side)
   * 2. Can we reach the analyzer on the network? (ping the IP)
   */
  async testConnection(id: string): Promise<{ success: boolean; message: string; latency?: number; listenerActive?: boolean; analyzerReachable?: boolean }> {
    const machine = await this.findOne(id);

    if (!machine.ipAddress || !machine.port) {
      return { success: false, message: 'No IP address or port configured for this machine' };
    }

    // Check 1: Is our TCP listener active for this machine?
    const listenerStatus = this.tcpListenerService.getListenerStatus();
    const listenerActive = listenerStatus.some(
      (s) => s.machineId === id && s.listening,
    );

    // Check 2: Can we reach the analyzer's IP? Try connecting to port 10001 on our own listener
    // to verify it's accepting connections, then also try to reach the analyzer IP.
    const analyzerReachable = await new Promise<boolean>((resolve) => {
      const socket = new net.Socket();
      socket.setTimeout(3000);

      socket.connect(machine.port!, '127.0.0.1', () => {
        socket.destroy();
        resolve(true);
      });

      socket.on('error', () => {
        socket.destroy();
        resolve(false);
      });

      socket.on('timeout', () => {
        socket.destroy();
        resolve(false);
      });
    });

    // Check 3: Ping the analyzer IP to see if it's on the network
    const networkReachable = await new Promise<boolean>((resolve) => {
      const socket = new net.Socket();
      socket.setTimeout(3000);

      // Try connecting to a common port on the analyzer just to check network reachability
      // Port 80 is often open on Zybio analyzers for their web interface
      socket.connect(80, machine.ipAddress!, () => {
        socket.destroy();
        resolve(true);
      });

      socket.on('error', (err: Error) => {
        socket.destroy();
        // "ECONNREFUSED" means the host IS reachable, just port 80 is closed — that's fine
        resolve(err.message.includes('ECONNREFUSED'));
      });

      socket.on('timeout', () => {
        socket.destroy();
        resolve(false);
      });
    });

    const messages: string[] = [];
    if (listenerActive) {
      messages.push('TCP listener is active on port ' + machine.port);
    } else {
      messages.push('TCP listener is NOT running — restart the backend or listener');
    }

    if (analyzerReachable) {
      messages.push('Listener accepting connections on port ' + machine.port);
    } else {
      messages.push('Listener not accepting connections — check firewall');
    }

    if (networkReachable) {
      messages.push('Analyzer at ' + machine.ipAddress + ' is reachable on the network');
    } else {
      messages.push('Cannot reach analyzer at ' + machine.ipAddress + ' — check network/cable');
    }

    const success = listenerActive && analyzerReachable;

    return {
      success,
      message: messages.join('. '),
      listenerActive,
      analyzerReachable: networkReachable,
    };
  }
}
