import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { TestCatalogService } from './test-catalog.service';
import { TestCatalogController, TestPanelsController, PriceHistoryController } from './test-catalog.controller';
import { TestCatalog, TestCatalogSchema } from '../database/schemas/test-catalog.schema';
import { TestPanel, TestPanelSchema } from '../database/schemas/test-panel.schema';
import { PriceHistory, PriceHistorySchema } from '../database/schemas/price-history.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: TestCatalog.name, schema: TestCatalogSchema },
      { name: TestPanel.name, schema: TestPanelSchema },
      { name: PriceHistory.name, schema: PriceHistorySchema },
    ]),
  ],
  controllers: [TestCatalogController, TestPanelsController, PriceHistoryController],
  providers: [TestCatalogService],
  exports: [TestCatalogService],
})
export class TestCatalogModule {}
