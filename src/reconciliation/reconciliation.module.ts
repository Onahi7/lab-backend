import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ReconciliationController } from './reconciliation.controller';
import { ReconciliationService } from './reconciliation.service';
import {
  CashReconciliation,
  CashReconciliationSchema,
} from '../database/schemas/cash-reconciliation.schema';
import { Order, OrderSchema } from '../database/schemas/order.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: CashReconciliation.name, schema: CashReconciliationSchema },
      { name: Order.name, schema: OrderSchema },
    ]),
  ],
  controllers: [ReconciliationController],
  providers: [ReconciliationService],
  exports: [ReconciliationService],
})
export class ReconciliationModule {}
