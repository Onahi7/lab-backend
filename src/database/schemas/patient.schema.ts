import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export enum GenderEnum {
  MALE = 'M',
  FEMALE = 'F',
  OTHER = 'O',
}

@Schema({ timestamps: true, collection: 'patients' })
export class Patient extends Document {
  @Prop({ required: true, unique: true })
  patientId: string; // LAB-YYYYMMDD-XXXX

  @Prop({ required: true })
  firstName: string;

  @Prop({ required: true })
  lastName: string;

  @Prop({ required: true })
  age: number;

  @Prop({ required: true, enum: Object.values(GenderEnum) })
  gender: GenderEnum;

  @Prop()
  phone?: string;

  @Prop()
  email?: string;

  @Prop()
  address?: string;

  @Prop({ sparse: true, unique: true })
  mrn?: string;

  @Prop({ type: Types.ObjectId, ref: 'Profile' })
  registeredBy?: Types.ObjectId;

  createdAt: Date;
  updatedAt: Date;
}

export const PatientSchema = SchemaFactory.createForClass(Patient);

// Indexes
PatientSchema.index({ patientId: 1 }, { unique: true });
PatientSchema.index({ firstName: 1, lastName: 1 });
PatientSchema.index({ mrn: 1 }, { sparse: true, unique: true });

// Text search index for name search
PatientSchema.index({ firstName: 'text', lastName: 'text' });
