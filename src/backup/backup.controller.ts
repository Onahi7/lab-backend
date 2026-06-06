import {
  Controller,
  Get,
  Post,
  Delete,
  Param,
  Res,
  UseGuards,
  HttpStatus,
  HttpCode,
} from '@nestjs/common';
import { Response } from 'express';
import { BackupService, BackupStatus } from './backup.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { UserRoleEnum } from '../database/schemas/user-role.schema';

@Controller('backup')
@UseGuards(JwtAuthGuard)
export class BackupController {
  constructor(private readonly backupService: BackupService) {}

  @Get('status')
  async getStatus(): Promise<BackupStatus> {
    return this.backupService.getStatus();
  }

  @Get('list')
  async listBackups() {
    const files = await this.backupService.listBackupFiles();
    return files;
  }

  @Post('run')
  @UseGuards(RolesGuard)
  @Roles(UserRoleEnum.ADMIN)
  async runBackup() {
    return this.backupService.runBackup();
  }

  @Get('download/:filename')
  async downloadBackup(
    @Param('filename') filename: string,
    @Res() res: Response,
  ) {
    const buffer = await this.backupService.getBackupBuffer(filename);
    res.setHeader('Content-Type', 'application/gzip');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(buffer);
  }

  @Delete(':filename')
  @UseGuards(RolesGuard)
  @Roles(UserRoleEnum.ADMIN)
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteBackup(@Param('filename') filename: string) {
    await this.backupService.deleteBackup(filename);
  }
}
