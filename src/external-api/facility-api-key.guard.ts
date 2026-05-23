import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import * as bcrypt from 'bcrypt';
import { ExternalApiClient } from '../database/schemas/external-api-client.schema';

@Injectable()
export class FacilityApiKeyGuard implements CanActivate {
  constructor(
    @InjectModel(ExternalApiClient.name)
    private externalApiClientModel: Model<ExternalApiClient>,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const apiKey = this.extractApiKey(request);

    if (!apiKey) {
      throw new UnauthorizedException('Missing API key');
    }

    const keyPrefix = apiKey.slice(0, 12);
    const client = await this.externalApiClientModel.findOne({
      keyPrefix,
      isActive: true,
    });

    if (!client || !(await bcrypt.compare(apiKey, client.apiKeyHash))) {
      throw new UnauthorizedException('Invalid API key');
    }

    client.lastUsedAt = new Date();
    await client.save();
    request.facility = client;

    return true;
  }

  private extractApiKey(request: any): string | undefined {
    const headerKey = request.headers['x-api-key'];
    if (typeof headerKey === 'string' && headerKey.trim()) {
      return headerKey.trim();
    }

    const authorization = request.headers.authorization;
    if (typeof authorization === 'string') {
      const [scheme, token] = authorization.split(' ');
      if (scheme?.toLowerCase() === 'bearer' && token) {
        return token.trim();
      }
    }

    return undefined;
  }
}
