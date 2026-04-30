import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  Res,
  StreamableFile,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiOperation,
  ApiProduces,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import type { Response } from 'express';
import { WolofTtsDto } from './dto/wolof-tts.dto';
import { TtsService } from './tts.service';

@ApiTags('TTS')
@ApiBearerAuth('JWT-auth')
@Controller('tts')
export class TtsController {
  constructor(private readonly ttsService: TtsService) {}

  @Post('wolof')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Synthèse audio Wolof via Adia_TTS' })
  @ApiBody({ type: WolofTtsDto })
  @ApiProduces('audio/wav', 'audio/mpeg', 'audio/flac', 'application/octet-stream')
  @ApiResponse({ status: 200, description: 'Flux audio généré avec succès.' })
  async synthesizeWolof(
    @Body() dto: WolofTtsDto,
    @Res({ passthrough: true }) response: Response,
  ) {
    const audio = await this.ttsService.synthesizeWolof(dto.text);
    response.setHeader('Content-Type', audio.contentType);
    response.setHeader('Cache-Control', 'private, max-age=3600');
    response.setHeader('X-TTS-Engine', 'adia_tts');

    return new StreamableFile(audio.buffer);
  }
}
