import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type PriceHistoryDocument = PriceHistory & Document;

@Schema({ timestamps: true, collection: 'price_history' })
export class PriceHistory {
  @Prop({ type: Types.ObjectId, ref: 'TestCatalog', required: false, index: true })
  testId?: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'TestPanel', required: false, index: true })
  panelId?: Types.ObjectId;

  @Prop({ required: true })
  entityType: 'test' | 'panel';

  @Prop({ required: true })
  code: string;

  @Prop({ required: true })
  name: string;

  @Prop({ required: true })
  oldPrice: number;

  @Prop({ required: true })
  newPrice: number;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  changedBy: Types.ObjectId;

  @Prop({ required: true })
  changedByName: string;

  @Prop()
  reason?: string;
}

export const PriceHistorySchema = SchemaFactory.createForClass(PriceHistory);

PriceHistorySchema.index({ testId: 1, createdAt: -1 });
PriceHistorySchema.index({ panelId: 1, createdAt: -1 });
PriceHistorySchema.index({ code: 1, createdAt: -1 });
