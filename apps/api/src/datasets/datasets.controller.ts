import { Controller, Get, Post, Patch, Delete, Body, Param, Headers, Query, UseGuards, Request } from '@nestjs/common';
import { DatasetsService } from './datasets.service';
import { CreateDatasetDto } from '@dataforge/shared';
import { AuthGuard } from '../auth/auth.guard';

@Controller('datasets')
export class DatasetsController {
  constructor(private readonly datasetsService: DatasetsService) {}

  @Get('trending')
  async getTrending() {
    return this.datasetsService.getTrending();
  }

  @Get('tags')
  async getTags() {
    return this.datasetsService.getTags();
  }

  @Post()
  @UseGuards(AuthGuard)
  async create(
    @Body() createDto: CreateDatasetDto,
    @Request() req: any
  ) {
    return this.datasetsService.create(createDto, req.user.walletAddress);
  }

  @Get()
  async findAll() {
    return this.datasetsService.findAllPublic();
  }

  @Get(':owner/:slug')
  async findByOwnerAndSlug(
    @Param('owner') owner: string,
    @Param('slug') slug: string
  ) {
    return this.datasetsService.findByOwnerAndSlug(owner, slug);
  }

  @Patch(':id')
  @UseGuards(AuthGuard)
  async update(
    @Param('id') id: string,
    @Body() body: any,
    @Request() req: any
  ) {
    return this.datasetsService.update(id, body, req.user.walletAddress);
  }

  @Delete(':id')
  @UseGuards(AuthGuard)
  async delete(
    @Param('id') id: string,
    @Request() req: any
  ) {
    return this.datasetsService.delete(id, req.user.walletAddress);
  }

  @Post(':id/fork')
  @UseGuards(AuthGuard)
  async fork(
    @Param('id') id: string,
    @Body() body: { targetName?: string },
    @Request() req: any
  ) {
    return this.datasetsService.fork(id, body.targetName, req.user.walletAddress);
  }

  @Get('id/:id/lineage')
  async getLineage(@Param('id') id: string) {
    return this.datasetsService.getLineage(id);
  }
}
