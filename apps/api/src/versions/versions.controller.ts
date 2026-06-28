import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Headers,
  UseInterceptors,
  UploadedFile,
  BadRequestException,
  PayloadTooLargeException,
  Res,
  UseGuards,
  Request,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { FileInterceptor } from '@nestjs/platform-express';
import { ConfigService } from '@nestjs/config';
import { VersionsService } from './versions.service';
import { CreateVersionDto } from '@dataforge/shared';
import { Response } from 'express';
import { AuthGuard } from '../auth/auth.guard';

@Controller()
export class VersionsController {
  private readonly maxFileSizeBytes: number;

  constructor(
    private readonly versionsService: VersionsService,
    private readonly configService: ConfigService,
  ) {
    const maxMb = parseInt(this.configService.get<string>('MAX_UPLOAD_FILE_SIZE_MB') || '25', 10);
    this.maxFileSizeBytes = maxMb * 1024 * 1024;
  }

  @Post('datasets/:datasetId/versions')
  @UseGuards(AuthGuard)
  async createVersion(
    @Param('datasetId') datasetId: string,
    @Body() createDto: CreateVersionDto,
    @Request() req: any
  ) {
    return this.versionsService.createVersion(datasetId, createDto, req.user.walletAddress);
  }

  @Get('datasets/:datasetId/versions')
  async getVersions(@Param('datasetId') datasetId: string) {
    return this.versionsService.getVersions(datasetId);
  }

  @Get('versions/:id')
  async getVersionDetails(@Param('id') id: string) {
    return this.versionsService.getVersionDetails(id);
  }

  // 20 requests per minute for file uploads
  @Post('versions/:id/files/upload')
  @UseGuards(AuthGuard)
  @Throttle({ default: { limit: 20, ttl: 60000 } })
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 25 * 1024 * 1024 } }))
  async uploadFile(
    @Param('id') versionId: string,
    @UploadedFile() file: any,
    @Body('path') filePath: string,
    @Request() req: any
  ) {
    if (!file) {
      throw new BadRequestException('No file uploaded');
    }
    // Enforce configurable max file size (default 25MB)
    if (file.size > this.maxFileSizeBytes) {
      const maxMb = Math.floor(this.maxFileSizeBytes / (1024 * 1024));
      throw new PayloadTooLargeException(
        `File too large. Maximum allowed size is ${maxMb}MB. Received ${(file.size / (1024 * 1024)).toFixed(1)}MB.`
      );
    }
    const targetPath = filePath || file.originalname;
    return this.versionsService.uploadFile(versionId, targetPath, file.buffer, req.user.walletAddress);
  }

  @Get('versions/:id/files')
  async getFiles(@Param('id') id: string) {
    return this.versionsService.getFiles(id);
  }

  // 10 requests per minute for publish
  @Post('versions/:id/publish')
  @UseGuards(AuthGuard)
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  async publishVersion(
    @Param('id') id: string,
    @Request() req: any
  ) {
    return this.versionsService.publishVersion(id, req.user.walletAddress);
  }

  @Get('versions/:id/status')
  async getVersionStatus(@Param('id') id: string) {
    return this.versionsService.getVersionStatus(id);
  }

  @Get('files/:id/preview')
  async getFilePreview(@Param('id') id: string) {
    return this.versionsService.getFilePreview(id);
  }

  @Get('files/:id/download')
  async downloadFile(@Param('id') id: string, @Res() res: Response) {
    const { stream, file } = await this.versionsService.downloadFileStream(id);
    
    // Set headers
    res.setHeader('Content-Type', file.mimeType || 'application/octet-stream');
    res.setHeader('Content-Disposition', `attachment; filename="${pathBasename(file.path)}"`);
    res.setHeader('Content-Length', file.size.toString());

    stream.pipe(res);
  }
}

// Utility to get basename
function pathBasename(filePath: string): string {
  return filePath.split('/').pop() || 'file';
}
