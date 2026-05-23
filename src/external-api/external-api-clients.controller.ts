import { Body, Controller, Get, Post } from '@nestjs/common';
import { Roles } from '../common/decorators/roles.decorator';
import { UserRoleEnum } from '../database/schemas/user-role.schema';
import { ExternalApiService } from './external-api.service';
import { CreateApiClientDto } from './dto/create-api-client.dto';

@Controller('external-api/clients')
@Roles(UserRoleEnum.ADMIN)
export class ExternalApiClientsController {
  constructor(private readonly externalApiService: ExternalApiService) {}

  @Post()
  createClient(@Body() dto: CreateApiClientDto) {
    return this.externalApiService.createApiClient(dto);
  }

  @Get()
  listClients() {
    return this.externalApiService.listApiClients();
  }
}
