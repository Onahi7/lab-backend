import {
  Controller,
  Post,
  Get,
  Body,
  UseGuards,
  Request,
  HttpCode,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { AuthService, AuthResponse } from './auth.service';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { LoginDto } from './dto/login.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { Public } from './decorators/public.decorator';

@Controller('auth')
export class AuthController {
  private readonly logger = new Logger(AuthController.name);

  constructor(private readonly authService: AuthService) {}

  /**
   * POST /auth/login
   * User login endpoint
   */
  @Public()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(@Body() loginDto: LoginDto): Promise<AuthResponse> {
    this.logger.log(`Login attempt for email: ${loginDto.email}`);
    
    try {
      const result = await this.authService.login(loginDto.email, loginDto.password);
      this.logger.log(`Login successful for email: ${loginDto.email}`);
      return result;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`Login failed for email: ${loginDto.email} - ${errorMessage}`);
      throw error;
    }
  }

  /**
   * POST /auth/logout
   * User logout endpoint
   */
  @Post('logout')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  async logout(@Request() req: any): Promise<{ message: string }> {
    const userId = req.user.userId;
    this.logger.log(`Logout request for user: ${userId}`);
    
    await this.authService.logout(userId);
    
    return { message: 'Logged out successfully' };
  }

  /**
   * POST /auth/refresh
   * Refresh access token using refresh token
   */
  @Public()
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  async refresh(@Body() refreshTokenDto: RefreshTokenDto): Promise<{ accessToken: string }> {
    this.logger.log('Token refresh request received');
    
    try {
      const result = await this.authService.refreshAccessToken(refreshTokenDto.refreshToken);
      this.logger.log('Token refresh successful');
      return result;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`Token refresh failed: ${errorMessage}`);
      throw error;
    }
  }

  /**
   * GET /auth/profile
   * Get current user profile
   */
  @Get('profile')
  @UseGuards(JwtAuthGuard)
  async getProfile(@Request() req: any): Promise<any> {
    const userId = req.user.userId;
    this.logger.log(`Profile request for user: ${userId}`);
    
    return this.authService.getProfile(userId);
  }
}
