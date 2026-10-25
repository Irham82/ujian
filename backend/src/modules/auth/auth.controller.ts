import { Body, Controller, Get, Inject, Patch, Post, Req, Res } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Response } from 'express';
import { AuthService } from './auth.service';
import { Public } from '../../common/roles.decorator';
import { AuthenticatedRequest } from '../../common/auth.guard';

@ApiTags('Auth & Profile')
@Controller('auth')
export class AuthController {
  constructor(@Inject(AuthService) private readonly authService: AuthService) {}

  @Public()
  @Post('login')
  @ApiOperation({ summary: 'Login dengan kredensial sekolah (Argon2id + HttpOnly Cookie + CSRF)' })
  async login(
    @Body() body: { username?: string; usernameOrEmail?: string; password?: string },
    @Req() req: AuthenticatedRequest,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.authService.login({
      usernameOrEmail: body.usernameOrEmail || body.username || '',
      password: body.password || '',
      ipAddress: req.ip,
      userAgent: String(req.headers['user-agent'] || ''),
    });

    res.cookie('cbt_access_token', result.accessToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 8 * 3600 * 1000,
      path: '/',
    });

    return result;
  }

  @Post('logout')
  @ApiOperation({ summary: 'Logout dan cabut sesi aktif' })
  async logout(@Req() req: AuthenticatedRequest, @Res({ passthrough: true }) res: Response) {
    res.clearCookie('cbt_access_token', { path: '/' });
    return this.authService.logout(
      req.user,
      req.ip,
      String(req.headers['user-agent'] || ''),
    );
  }

  @Post('refresh')
  @ApiOperation({ summary: 'Rotasi sesi dan perbarui token akses & CSRF' })
  async refresh(@Req() req: AuthenticatedRequest, @Res({ passthrough: true }) res: Response) {
    const rotated = await this.authService.rotateSession(req.user);
    res.cookie('cbt_access_token', rotated.accessToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 8 * 3600 * 1000,
      path: '/',
    });
    return rotated;
  }

  @Get('me')
  @ApiOperation({ summary: 'Ambil profil pengguna aktif dan waktu server UTC' })
  async me(@Req() req: AuthenticatedRequest) {
    return this.authService.getMe(req.user.sub);
  }

  @Patch('profile')
  @ApiOperation({ summary: 'Perbarui profil pengguna atau ganti password' })
  async updateProfile(
    @Req() req: AuthenticatedRequest,
    @Body()
    body: {
      fullName?: string;
      email?: string;
      currentPassword?: string;
      newPassword?: string;
    },
  ) {
    return this.authService.updateProfile(req.user, body);
  }
}
