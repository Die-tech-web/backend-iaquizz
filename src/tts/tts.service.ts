import {
  HttpException,
  HttpStatus,
  Injectable,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

type CachedAudioEntry = {
  buffer: Buffer;
  contentType: string;
  expiresAt: number;
};

type SynthesizedAudio = {
  buffer: Buffer;
  contentType: string;
};

@Injectable()
export class TtsService {
  private readonly logger = new Logger(TtsService.name);
  private readonly cache = new Map<string, CachedAudioEntry>();
  private readonly hfRouterBaseUrl = 'https://router.huggingface.co/hf-inference/models';
  private readonly hfInferenceBaseUrl = 'https://api-inference.huggingface.co/models';
  private readonly defaultModel = 'CONCREE/Adia_TTS';
  private readonly defaultVoiceDescription =
    'A clear and educational voice, with a flow adapted to learning';
  private readonly defaultCacheTtlMs = 1000 * 60 * 60;
  private readonly maxCacheEntries = 250;

  constructor(private readonly configService: ConfigService) {}

  async synthesizeWolof(text: string): Promise<SynthesizedAudio> {
    const normalizedText = this.normalizeText(text);
    if (!normalizedText) {
      throw new HttpException('Le texte Wolof est vide.', HttpStatus.BAD_REQUEST);
    }

    const model = this.configService.get<string>('HUGGINGFACE_MODEL') ?? this.defaultModel;
    const token = this.configService.get<string>('HUGGINGFACE_API_KEY');
    if (!token) {
      throw new InternalServerErrorException(
        'HUGGINGFACE_API_KEY manquante pour la synthèse wolof.',
      );
    }

    const cacheKey = `${model}:${normalizedText}`;
    const cached = this.getFromCache(cacheKey);
    if (cached) {
      return cached;
    }

    const endpointCandidates = this.getEndpointCandidates(model);
    const audio = await this.requestAudioFromHuggingFace(
      endpointCandidates,
      token,
      normalizedText,
    );
    this.saveToCache(cacheKey, audio);
    return audio;
  }

  private normalizeText(text: string) {
    return text.replace(/\s+/g, ' ').trim();
  }

  private getCacheTtlMs() {
    const configured = Number(this.configService.get<string>('TTS_CACHE_TTL_MS'));
    if (Number.isFinite(configured) && configured > 0) {
      return configured;
    }
    return this.defaultCacheTtlMs;
  }

  private getFromCache(cacheKey: string): SynthesizedAudio | null {
    const now = Date.now();
    const existing = this.cache.get(cacheKey);
    if (!existing) {
      return null;
    }
    if (existing.expiresAt <= now) {
      this.cache.delete(cacheKey);
      return null;
    }
    return {
      buffer: existing.buffer,
      contentType: existing.contentType,
    };
  }

  private saveToCache(cacheKey: string, audio: SynthesizedAudio) {
    if (this.cache.size >= this.maxCacheEntries) {
      const oldestKey = this.cache.keys().next().value;
      if (oldestKey) {
        this.cache.delete(oldestKey);
      }
    }
    this.cache.set(cacheKey, {
      ...audio,
      expiresAt: Date.now() + this.getCacheTtlMs(),
    });
  }

  private getEndpointCandidates(model: string) {
    const dedicatedEndpoint = this.configService.get<string>('TTS_WOLOF_ENDPOINT')?.trim();
    const normalizedModel = model.trim();
    const defaults = [
      `${this.hfRouterBaseUrl}/${normalizedModel}`,
      `${this.hfInferenceBaseUrl}/${normalizedModel}`,
    ];

    if (dedicatedEndpoint) {
      return [dedicatedEndpoint, ...defaults];
    }

    return defaults;
  }

  private async requestAudioFromHuggingFace(
    endpoints: string[],
    token: string,
    text: string,
  ): Promise<SynthesizedAudio> {
    const payloadCandidates: Array<Record<string, unknown>> = [
      { inputs: text },
      { inputs: { text, description: this.defaultVoiceDescription } },
      { inputs: `${this.defaultVoiceDescription}. ${text}` },
      { inputs: { prompt: text, description: this.defaultVoiceDescription } },
    ];

    let lastErrorMessage = 'Erreur inconnue lors de la génération audio Wolof.';
    let dedicatedEndpointRequired = false;

    for (const endpoint of endpoints) {
      for (const payload of payloadCandidates) {
        try {
          const response = await this.postToHuggingFace(endpoint, token, payload);
          if (!response.ok) {
            lastErrorMessage = await this.extractErrorMessage(response);
            const lowerMessage = lastErrorMessage.toLowerCase();
            const modelUnsupportedOnProvider =
              response.status === 400 &&
              lowerMessage.includes('model not supported by provider');
            if (modelUnsupportedOnProvider) {
              dedicatedEndpointRequired = true;
              break;
            }

            this.logger.warn(
              `TTS Wolof non disponible sur ${endpoint} (${response.status}): ${lastErrorMessage}`,
            );
            continue;
          }

          const contentType = (response.headers.get('content-type') ?? '').toLowerCase();
          const buffer = Buffer.from(await response.arrayBuffer());
          if (!buffer.length) {
            lastErrorMessage = 'Réponse audio vide depuis Hugging Face.';
            continue;
          }

          if (
            !contentType.includes('audio/') &&
            !contentType.includes('application/octet-stream')
          ) {
            lastErrorMessage =
              'La réponse Hugging Face n est pas un flux audio exploitable.';
            continue;
          }

          return {
            buffer,
            contentType: contentType.includes('audio/') ? contentType : 'audio/wav',
          };
        } catch (error) {
          lastErrorMessage =
            error instanceof Error ? error.message : 'Échec réseau vers Hugging Face.';
        }
      }

      if (dedicatedEndpointRequired) {
        break;
      }
    }

    this.logger.error(`TTS Wolof: ${lastErrorMessage}`);
    const normalizedError = lastErrorMessage.toLowerCase();
    const needsDedicatedInference =
      dedicatedEndpointRequired ||
      normalizedError.includes('not supported') ||
      normalizedError.includes('unsupported') ||
      normalizedError.includes('too large') ||
      normalizedError.includes('model is loading') ||
      normalizedError.includes('fetch failed') ||
      normalizedError.includes('503');

    if (needsDedicatedInference) {
      throw new HttpException(
        "Adia_TTS n'est pas disponible via l'inférence standard. Déployez un endpoint TTS Wolof dédié (GPU) puis configurez TTS_WOLOF_ENDPOINT.",
        HttpStatus.BAD_GATEWAY,
      );
    }

    throw new HttpException(
      `La génération audio Wolof est indisponible: ${lastErrorMessage}`,
      HttpStatus.BAD_GATEWAY,
    );
  }

  private async postToHuggingFace(
    endpoint: string,
    token: string,
    payload: Record<string, unknown>,
  ) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 45_000);

    try {
      return await fetch(endpoint, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
          Accept: 'audio/wav,audio/flac,audio/mpeg,application/octet-stream',
        },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timeout);
    }
  }

  private async extractErrorMessage(response: Response) {
    const fallback = `Hugging Face a répondu ${response.status}.`;
    try {
      const contentType = response.headers.get('content-type') ?? '';
      if (contentType.includes('application/json')) {
        const payload = (await response.json()) as { error?: string; message?: string };
        return payload.error ?? payload.message ?? fallback;
      }

      const raw = await response.text();
      if (raw.includes('Cannot POST /models/')) {
        return "Route d'inférence Hugging Face indisponible pour ce modèle.";
      }
      if (contentType.includes('text/html')) {
        return fallback;
      }
      return raw?.trim() || fallback;
    } catch {
      return fallback;
    }
  }
}
