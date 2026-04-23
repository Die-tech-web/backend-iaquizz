import {
  BadGatewayException,
  BadRequestException,
  Injectable,
  Logger,
  OnModuleInit,
} from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { firstValueFrom } from 'rxjs';
import { MedicalTopicEntity } from './entities/medical-topic.entity';
import { DiseaseCorrelationEntity } from './entities/disease-correlation.entity';
import { CORRELATIONS_SEED, MEDICAL_TOPICS_SEED } from './data/seed.data';
import { MedicalTopicKey } from '../common/enums/medical-topic.enum';
import { SearchIcdQueryDto } from './dto/search-icd-query.dto';

type WhoTokenResponse = {
  access_token: string;
  expires_in: number;
};

type WhoSearchEntity = {
  id?: string;
  title?: string;
  theCode?: string;
  code?: string;
  uri?: string;
};

type WhoSearchResponse = {
  destinationEntities?: WhoSearchEntity[];
};

@Injectable()
export class IcdService implements OnModuleInit {
  private readonly logger = new Logger(IcdService.name);
  private cachedWhoToken: string | null = null;
  private cachedWhoTokenExpiryTs = 0;

  constructor(
    @InjectRepository(MedicalTopicEntity)
    private readonly topicRepository: Repository<MedicalTopicEntity>,
    @InjectRepository(DiseaseCorrelationEntity)
    private readonly correlationRepository: Repository<DiseaseCorrelationEntity>,
    private readonly httpService: HttpService,
    private readonly configService: ConfigService,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.seedTopics();
    await this.seedCorrelations();
  }

  async findAllTopics(): Promise<MedicalTopicEntity[]> {
    return this.topicRepository.find({ order: { label: 'ASC' } });
  }

  async findCorrelations(mainTopic: MedicalTopicKey): Promise<DiseaseCorrelationEntity[]> {
    return this.correlationRepository.find({
      where: { primaryTopic: { key: mainTopic } },
      relations: { correlatedTopic: true, primaryTopic: true },
      order: { priority: 'DESC' },
    });
  }

  async getTopicMapByKeys(keys: MedicalTopicKey[]): Promise<Map<MedicalTopicKey, MedicalTopicEntity>> {
    const topics = await this.topicRepository.find({ where: { key: In(keys) } });
    return new Map(topics.map((topic) => [topic.key, topic]));
  }

  async searchExternal(query: SearchIcdQueryDto) {
    const searchTerm = query.q?.trim();
    if (!searchTerm) {
      throw new BadRequestException('Query q is required');
    }

    const clientId = this.configService.get<string>('WHO_ICD_CLIENT_ID');
    const clientSecret = this.configService.get<string>('WHO_ICD_CLIENT_SECRET');
    if (!clientId || !clientSecret) {
      throw new BadRequestException(
        'WHO ICD API credentials missing. Set WHO_ICD_CLIENT_ID and WHO_ICD_CLIENT_SECRET in .env',
      );
    }

    const token = await this.getWhoAccessToken(clientId, clientSecret);
    const baseUrl = this.configService.get<string>(
      'WHO_ICD_BASE_URL',
      'https://id.who.int/icd/release/11/2025-01/mms',
    );

    const lang = query.lang?.trim() || 'en';
    const limit = query.limit ?? 10;

    try {
      const response = await firstValueFrom(
        this.httpService.get<WhoSearchResponse>(`${baseUrl}/search`, {
          headers: {
            Authorization: `Bearer ${token}`,
            Accept: 'application/json',
            'Accept-Language': lang,
            'API-Version': 'v2',
          },
          params: {
            q: searchTerm,
            useFlexisearch: true,
            flatResults: true,
            highlightingEnabled: false,
            limit,
          },
        }),
      );

      const items = (response.data.destinationEntities ?? []).map((item) => ({
        id: item.id ?? null,
        title: item.title ?? null,
        code: item.theCode ?? item.code ?? null,
        uri: item.uri ?? null,
      }));

      return {
        source: 'WHO ICD-11 API',
        releaseBaseUrl: baseUrl,
        language: lang,
        query: searchTerm,
        count: items.length,
        items,
      };
    } catch (error: unknown) {
      throw new BadGatewayException(
        `WHO ICD API request failed: ${this.toErrorMessage(error)}`,
      );
    }
  }

  private async seedTopics(): Promise<void> {
    const count = await this.topicRepository.count();
    if (count > 0) {
      return;
    }

    await this.topicRepository.save(MEDICAL_TOPICS_SEED.map((topic) => this.topicRepository.create(topic)));
    this.logger.log('ICD-11 topic catalog seeded');
  }

  private async seedCorrelations(): Promise<void> {
    const count = await this.correlationRepository.count();
    if (count > 0) {
      return;
    }

    const topics = await this.topicRepository.find();
    const map = new Map(topics.map((topic) => [topic.key, topic]));

    const records = CORRELATIONS_SEED.map((correlation) =>
      this.correlationRepository.create({
        primaryTopic: map.get(correlation.primary),
        correlatedTopic: map.get(correlation.correlated),
        priority: correlation.priority,
        type: correlation.type,
        strength: correlation.strength,
        rationale: correlation.rationale,
      }),
    );

    await this.correlationRepository.save(records);
    this.logger.log('Disease correlation graph seeded');
  }

  private async getWhoAccessToken(
    clientId: string,
    clientSecret: string,
  ): Promise<string> {
    const now = Date.now();
    if (this.cachedWhoToken && now < this.cachedWhoTokenExpiryTs) {
      return this.cachedWhoToken;
    }

    const tokenEndpoint = this.configService.get<string>(
      'WHO_ICD_TOKEN_URL',
      'https://icdaccessmanagement.who.int/connect/token',
    );

    const form = new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: clientId,
      client_secret: clientSecret,
      scope: 'icdapi_access',
    });

    try {
      const response = await firstValueFrom(
        this.httpService.post<WhoTokenResponse>(tokenEndpoint, form.toString(), {
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
          },
        }),
      );

      const accessToken = response.data.access_token;
      const expiresInSec = response.data.expires_in ?? 3600;

      if (!accessToken) {
        throw new BadGatewayException('WHO token response did not include access_token');
      }

      this.cachedWhoToken = accessToken;
      this.cachedWhoTokenExpiryTs = now + Math.max(expiresInSec - 30, 30) * 1000;
      return accessToken;
    } catch (error: unknown) {
      throw new BadGatewayException(
        `WHO ICD token request failed: ${this.toErrorMessage(error)}`,
      );
    }
  }

  private toErrorMessage(error: unknown): string {
    if (error instanceof Error) {
      return error.message;
    }

    return 'Unknown error';
  }
}
