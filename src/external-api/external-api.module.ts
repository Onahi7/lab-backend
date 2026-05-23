import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ExternalApiController } from './external-api.controller';
import { ExternalApiClientsController } from './external-api-clients.controller';
import { ExternalApiService } from './external-api.service';
import { FacilityApiKeyGuard } from './facility-api-key.guard';
import {
  ExternalApiClient,
  ExternalApiClientSchema,
} from '../database/schemas/external-api-client.schema';
import { Order, OrderSchema } from '../database/schemas/order.schema';
import { Result, ResultSchema } from '../database/schemas/result.schema';
import {
  TestCatalog,
  TestCatalogSchema,
} from '../database/schemas/test-catalog.schema';
import { TestPanel, TestPanelSchema } from '../database/schemas/test-panel.schema';
import { PatientsModule } from '../patients/patients.module';
import { OrdersModule } from '../orders/orders.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: ExternalApiClient.name, schema: ExternalApiClientSchema },
      { name: Order.name, schema: OrderSchema },
      { name: Result.name, schema: ResultSchema },
      { name: TestCatalog.name, schema: TestCatalogSchema },
      { name: TestPanel.name, schema: TestPanelSchema },
    ]),
    PatientsModule,
    OrdersModule,
  ],
  controllers: [ExternalApiController, ExternalApiClientsController],
  providers: [ExternalApiService, FacilityApiKeyGuard],
})
export class ExternalApiModule {}
