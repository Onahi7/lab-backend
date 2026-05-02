import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

@Schema({ timestamps: true, collection: 'doctors' })
export class Doctor extends Document {
  @Prop({ required: true, trim: true })
  fullName: string;

  @Prop({ trim: true })
  phone?: string;

  @Prop({ trim: true })
  facility?: string;

  @Prop({ default: true })
  isActive: boolean;
}

export const DoctorSchema = SchemaFactory.createForClass(Doctor);
DoctorSchema.index({ fullName: 1 });
