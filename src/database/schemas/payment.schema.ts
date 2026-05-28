import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

@Schema({ timestamps: true, collection: 'payments' })
export class Payment extends Document {
  @Prop({ type: Types.ObjectId, ref: 'Order', index: true })
  orderId?: Types.ObjectId;

  @Prop({ required: true, min: 0 })
  amount: number;

  @Prop({ required: true })
  paymentMethod: string;

  @Prop({ type: Types.ObjectId, ref: 'Profile' })
  receivedBy?: Types.ObjectId;

  @Prop()
  notes?: string;

  // Source tracking: 'lab' for lab orders, 'pharmacy' for pharmacy dispensary sales
  @Prop({ default: 'lab' })
  source?: string;

  // Pharmacy sale reference (when source = 'pharmacy')
  @Prop()
  cafSaleId?: string;

  @Prop()
  cafReceiptNumber?: string;

  createdAt: Date;
  updatedAt: Date;
}

export const PaymentSchema = SchemaFactory.createForClass(Payment);
PaymentSchema.index({ orderId: 1, createdAt: -1 });
PaymentSchema.index({ source: 1, createdAt: -1 });
