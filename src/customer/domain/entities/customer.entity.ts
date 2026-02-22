import { SourceSystem } from '../enums/source-system.enum';

export class Customer {
  readonly id: string;
  readonly email: string;
  readonly name: string;
  readonly address: string;
  readonly phone: string | null;
  readonly contractStartDate: string | null;
  readonly contractType: string | null;
  readonly lastUpdated: Date;
  readonly source: SourceSystem;

  constructor(params: {
    id: string;
    email: string;
    name: string;
    address: string;
    phone?: string | null;
    contractStartDate?: string | null;
    contractType?: string | null;
    lastUpdated: Date;
    source: SourceSystem;
  }) {
    this.id = params.id;
    this.email = params.email.toLowerCase().trim();
    this.name = params.name;
    this.address = params.address;
    this.phone = params.phone ?? null;
    this.contractStartDate = params.contractStartDate ?? null;
    this.contractType = params.contractType ?? null;
    this.lastUpdated = params.lastUpdated;
    this.source = params.source;
  }
}
