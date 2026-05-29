import {
  Controller,
  Post,
  Get,
  Body,
  Param,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { RsvpService } from './rsvp.service';
import { CreateRsvpBodyDto } from './create-rsvp.dto';
import { RsvpResponseDto } from '@event-platform/commons';

@Controller('rsvp')
export class RsvpController {
  constructor(private readonly rsvpService: RsvpService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async confirm(
    @Body() dto: CreateRsvpBodyDto,
  ): Promise<{ data: RsvpResponseDto; isNew: boolean }> {
    const { rsvp, isNew } = await this.rsvpService.confirm(dto);

    return { data: rsvp, isNew };
  }

  @Get(':id')
  async findById(@Param('id') id: string): Promise<RsvpResponseDto> {
    return this.rsvpService.findById(id);
  }
}
