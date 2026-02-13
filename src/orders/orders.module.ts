import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { OrdersService } from './orders.service';
import { OrdersController } from './orders.controller';
import { Order, OrderSchema } from '../database/schemas/order.schema';
import { OrderTest, OrderTestSchema } from '../database/schemas/order-test.schema';
import { IdSequence, IdSequenceSchema } from '../database/schemas/id-sequence.schema';
import { RealtimeModule } from '../realtime/realtime.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Order.name, schema: OrderSchema },
      { name: OrderTest.name, schema: OrderTestSchema },
      { name: IdSequence.name, schema: IdSequenceSchema },
    ]),
    RealtimeModule,
  ],
  controllers: [OrdersController],
  providers: [OrdersService],
  exports: [OrdersService],
})
export class OrdersModule {}
