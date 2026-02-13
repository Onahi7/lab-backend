import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayConnection,
  OnGatewayDisconnect,
  ConnectedSocket,
  MessageBody,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Logger, UseGuards } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';

@WebSocketGateway({
  cors: {
    origin: '*', // Allow all origins on LAN
    credentials: true,
  },
  namespace: '/realtime',
})
export class RealtimeGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(RealtimeGateway.name);
  private connectedClients = new Map<string, { userId: string; role: string }>();

  constructor(private jwtService: JwtService) {}

  async handleConnection(client: Socket) {
    try {
      // Authenticate client
      const token = client.handshake.auth.token;
      
      if (!token) {
        this.logger.error(`No token provided for client ${client.id}`);
        client.disconnect();
        return;
      }

      this.logger.debug(`Attempting to verify token for client ${client.id}`);
      const payload = await this.jwtService.verifyAsync(token);
      
      this.connectedClients.set(client.id, {
        userId: payload.sub,
        role: payload.roles[0],
      });

      this.logger.log(`Client connected: ${client.id} (User: ${payload.sub}, Role: ${payload.roles[0]})`);
      
      // Join role-specific room
      client.join(`role:${payload.roles[0]}`);
      
      // Send connection confirmation
      client.emit('connected', {
        message: 'Connected to real-time updates',
        clientId: client.id,
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`Authentication failed for client ${client.id}: ${errorMessage}`);
      client.disconnect();
    }
  }

  handleDisconnect(client: Socket) {
    const clientInfo = this.connectedClients.get(client.id);
    this.logger.log(`Client disconnected: ${client.id}`);
    this.connectedClients.delete(client.id);
  }

  // Emit to all clients
  emitToAll(event: string, data: any) {
    this.server.emit(event, data);
  }

  // Emit to specific role
  emitToRole(role: string, event: string, data: any) {
    this.server.to(`role:${role}`).emit(event, data);
  }

  // Order events
  notifyOrderCreated(order: any) {
    this.logger.log(`Broadcasting order created: ${order.orderNumber}`);
    this.emitToAll('order:created', order);
  }

  notifyOrderUpdated(order: any) {
    this.logger.log(`Broadcasting order updated: ${order.orderNumber}`);
    this.emitToAll('order:updated', order);
  }

  notifyOrderStatusChanged(orderId: string, status: string, orderNumber: string) {
    this.logger.log(`Broadcasting order status changed: ${orderNumber} -> ${status}`);
    this.emitToAll('order:status_changed', { orderId, status, orderNumber });
  }

  // Result events
  notifyResultCreated(result: any) {
    this.logger.log(`Broadcasting result created: ${result.testCode}`);
    this.emitToAll('result:created', result);
    
    // Send critical result alert to lab techs and admins
    if (result.flag === 'critical_high' || result.flag === 'critical_low') {
      this.emitToRole('lab_tech', 'result:critical', result);
      this.emitToRole('admin', 'result:critical', result);
    }
  }

  notifyResultVerified(result: any) {
    this.logger.log(`Broadcasting result verified: ${result.testCode}`);
    this.emitToAll('result:verified', result);
  }

  // Patient events
  notifyPatientCreated(patient: any) {
    this.logger.log(`Broadcasting patient created: ${patient.patientId}`);
    this.emitToAll('patient:created', patient);
  }

  // Sample events
  notifySampleCollected(sample: any) {
    this.logger.log(`Broadcasting sample collected`);
    this.emitToRole('lab_tech', 'sample:collected', sample);
    this.emitToRole('admin', 'sample:collected', sample);
  }

  // Get connected clients count
  getConnectedClientsCount(): number {
    return this.connectedClients.size;
  }

  // Get clients by role
  getClientsByRole(role: string): number {
    return Array.from(this.connectedClients.values())
      .filter(client => client.role === role)
      .length;
  }
}
