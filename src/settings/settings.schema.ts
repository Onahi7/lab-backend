import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type SettingsDocument = Settings & Document;

@Schema({ collection: 'settings', timestamps: true })
export class Settings {
  @Prop({ required: true, unique: true })
  key: string;

  @Prop({ type: Object, required: true })
  value: Record<string, any>;
}

export const SettingsSchema = SchemaFactory.createForClass(Settings);
