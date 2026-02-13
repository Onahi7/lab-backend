import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { MachinesService } from './machines.service';
import { MachinesController } from './machines.controller';
import { Machine, MachineSchema } from '../database/schemas/machine.schema';
import {
  MachineMaintenance,
  MachineMaintenanceSchema,
} from '../database/schemas/machine-maintenance.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Machine.name, schema: MachineSchema },
      { name: MachineMaintenance.name, schema: MachineMaintenanceSchema },
    ]),
  ],
  controllers: [MachinesController],
  providers: [MachinesService],
  exports: [MachinesService],
})
export class MachinesModule {}
