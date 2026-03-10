import { Controller, Get, Patch, Body, UseGuards } from '@nestjs/common';
import { SettingsService } from './settings.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { UserRoleEnum } from '../database/schemas/user-role.schema';

@Controller('settings')
@UseGuards(JwtAuthGuard)
export class SettingsController {
  constructor(private readonly settingsService: SettingsService) {}

  @Get('printer')
  getPrinterSettings() {
    return this.settingsService.getPrinterSettings();
  }

  @Patch('printer')
  @UseGuards(RolesGuard)
  @Roles(UserRoleEnum.ADMIN)
  updatePrinterSettings(@Body() body: Record<string, any>) {
    return this.settingsService.updatePrinterSettings(body);
  }
}
