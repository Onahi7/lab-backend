import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { PanelInterpretationsController } from './panel-interpretations.controller';
import { PanelInterpretationsService } from './panel-interpretations.service';
import {
  PanelInterpretation,
  PanelInterpretationSchema,
} from '../database/schemas/panel-interpretation.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: PanelInterpretation.name, schema: PanelInterpretationSchema },
    ]),
  ],
  controllers: [PanelInterpretationsController],
  providers: [PanelInterpretationsService],
  exports: [PanelInterpretationsService],
})
export class PanelInterpretationsModule {}
