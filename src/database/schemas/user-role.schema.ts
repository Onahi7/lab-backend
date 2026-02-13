import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export enum UserRoleEnum {
  ADMIN = 'admin',
  LAB_TECH = 'lab_tech',
  RECEPTIONIST = 'receptionist',
}

@Schema({ timestamps: true, collection: 'user_roles' })
export class UserRole extends Document {
  @Prop({ type: Types.ObjectId, ref: 'Profile', required: true })
  userId: Types.ObjectId;

  @Prop({ required: true, enum: Object.values(UserRoleEnum) })
  role: UserRoleEnum;

  createdAt: Date;
}

export const UserRoleSchema = SchemaFactory.createForClass(UserRole);

// Indexes
UserRoleSchema.index({ userId: 1 });
UserRoleSchema.index({ userId: 1, role: 1 }, { unique: true });
