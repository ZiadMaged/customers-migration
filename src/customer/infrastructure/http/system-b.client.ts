import { Injectable, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom, of } from 'rxjs';
import { timeout, catchError } from 'rxjs/operators';
import { ICustomerRepository } from '../../application/interfaces/customer-repository.interface';
import { Customer } from '../../domain/entities/customer.entity';
import {
  CustomerBMapper,
  SystemBApiResponse,
} from './mappers/customer-b.mapper';

@Injectable()
export class SystemBClient implements ICustomerRepository {
  private readonly logger = new Logger(SystemBClient.name);
  private readonly TIMEOUT_MS = 5000; // 5 seconds timeout for external calls

  constructor(private readonly httpService: HttpService) {}

  async findByEmail(email: string): Promise<Customer | null> {
    try {
      const response = await firstValueFrom(
        this.httpService
          .get<SystemBApiResponse>(`/customers/${encodeURIComponent(email)}`)
          .pipe(
            timeout(this.TIMEOUT_MS),
            catchError((err: Error) => {
              this.logger.warn(
                `System B findByEmail failed for ${email}: ${err.message}`,
              );
              return of(null);
            }),
          ),
      );

      if (!response || !response.data) {
        return null;
      }

      this.logger.debug(
        `System B: Found customer ${response.data.uuid} for email ${email}`,
      );
      return CustomerBMapper.toDomain(response.data);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(
        `System B findByEmail unexpected error for ${email}: ${message}`,
      );
      return null;
    }
  }

  async searchByName(query: string): Promise<Customer[]> {
    try {
      const response = await firstValueFrom(
        this.httpService
          .get<SystemBApiResponse[]>('/customers', {
            params: { q: query },
          })
          .pipe(
            timeout(this.TIMEOUT_MS),
            catchError((err: Error) => {
              this.logger.warn(
                `System B search failed for "${query}": ${err.message}`,
              );
              return of(null);
            }),
          ),
      );

      if (!response || !response.data) {
        return [];
      }

      const customers = Array.isArray(response.data) ? response.data : [];
      this.logger.debug(
        `System B: Found ${customers.length} customers matching "${query}"`,
      );
      return customers.map((c) => CustomerBMapper.toDomain(c));
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(
        `System B search unexpected error for "${query}": ${message}`,
      );
      return [];
    }
  }

  async isHealthy(): Promise<boolean> {
    try {
      const response = await firstValueFrom(
        this.httpService.get<{ status: string }>('/ping').pipe(
          timeout(3000),
          catchError(() => of(null)),
        ),
      );
      return response?.data?.status === 'ok';
    } catch {
      return false;
    }
  }
}
