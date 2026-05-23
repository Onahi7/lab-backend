import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

@Schema({ timestamps: true, collection: 'external_api_clients' })
export class ExternalApiClient extends Document {
  @Prop({ required: true })
  facilityName: string;

  @Prop({ required: true, unique: true })
  keyPrefix: string;

  @Prop({ required: true })
  apiKeyHash: string;

  @Prop({ default: true, index: true })
  isActive: boolean;

  @Prop()
  contactName?: string;

  @Prop()
  contactPhone?: string;

  @Prop()
  contactEmail?: string;

  @Prop()
  lastUsedAt?: Date;

  createdAt: Date;
  updatedAt: Date;
}

export const ExternalApiClientSchema =
  SchemaFactory.createForClass(ExternalApiClient);

ExternalApiClientSchema.index({ keyPrefix: 1 }, { unique: true });
ExternalApiClientSchema.index({ isActive: 1 });
