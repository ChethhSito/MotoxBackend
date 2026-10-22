import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../../infrastructure/database/database.service.js';

@Injectable()
export class NegociosRepository {
  constructor(private readonly database: DatabaseService) {}

  query<T extends import('pg').QueryResultRow>(
    sql: string,
    params: readonly unknown[],
  ) {
    return this.database.query<T>(sql, params);
  }

  transaction<T>(work: (client: import('pg').PoolClient) => Promise<T>) {
    return this.database.transaction(work);
  }
}
