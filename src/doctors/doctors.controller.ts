import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { UserRoleEnum } from '../database/schemas/user-role.schema';
import { DoctorsService } from './doctors.service';
import { CreateDoctorDto } from './dto/create-doctor.dto';
import { UpdateDoctorDto } from './dto/update-doctor.dto';

@Controller('doctors')
@UseGuards(JwtAuthGuard, RolesGuard)
export class DoctorsController {
  constructor(private readonly doctorsService: DoctorsService) {}

  @Post()
  @Roles(UserRoleEnum.ADMIN, UserRoleEnum.RECEPTIONIST)
  async create(@Body() dto: CreateDoctorDto) {
    return this.doctorsService.create(dto);
  }

  @Get()
  @Roles(UserRoleEnum.ADMIN, UserRoleEnum.RECEPTIONIST, UserRoleEnum.LAB_TECH)
  async findAll(
    @Query('search') search?: string,
    @Query('activeOnly') activeOnly?: string,
  ) {
    const active = activeOnly === undefined ? true : activeOnly !== 'false';
    return this.doctorsService.findAll(search, active);
  }

  @Get(':id')
  @Roles(UserRoleEnum.ADMIN, UserRoleEnum.RECEPTIONIST, UserRoleEnum.LAB_TECH)
  async findOne(@Param('id') id: string) {
    return this.doctorsService.findOne(id);
  }

  @Patch(':id')
  @Roles(UserRoleEnum.ADMIN)
  async update(@Param('id') id: string, @Body() dto: UpdateDoctorDto) {
    return this.doctorsService.update(id, dto);
  }
}
