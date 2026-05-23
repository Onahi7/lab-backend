import { Body, Controller, Get, Param, Post, Request, UseGuards } from '@nestjs/common';
import { Public } from '../auth/decorators/public.decorator';
import { ExternalApiService } from './external-api.service';
import { FacilityApiKeyGuard } from './facility-api-key.guard';
import { CreateFacilityTestRequestDto } from './dto/create-facility-test-request.dto';
import { FacilityPaymentDto } from './dto/facility-payment.dto';

@Controller('external-api')
@Public()
@UseGuards(FacilityApiKeyGuard)
export class ExternalApiController {
  constructor(private readonly externalApiService: ExternalApiService) {}

  @Get('catalog')
  getCatalog() {
    return this.externalApiService.getCatalog();
  }

  @Post('test-requests')
  createTestRequest(
    @Body() dto: CreateFacilityTestRequestDto,
    @Request() req: any,
  ) {
    return this.externalApiService.createTestRequest(req.facility, dto);
  }

  @Get('test-requests/:externalRequestId')
  getTestRequest(
    @Param('externalRequestId') externalRequestId: string,
    @Request() req: any,
  ) {
    return this.externalApiService.getTestRequest(
      req.facility,
      externalRequestId,
    );
  }

  @Post('test-requests/:externalRequestId/payment')
  addPayment(
    @Param('externalRequestId') externalRequestId: string,
    @Body() dto: FacilityPaymentDto,
    @Request() req: any,
  ) {
    return this.externalApiService.addPayment(
      req.facility,
      externalRequestId,
      dto,
    );
  }

  @Get('test-requests/:externalRequestId/results')
  getResults(
    @Param('externalRequestId') externalRequestId: string,
    @Request() req: any,
  ) {
    return this.externalApiService.getResults(req.facility, externalRequestId);
  }
}
