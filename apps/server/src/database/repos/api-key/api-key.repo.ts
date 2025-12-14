import { Injectable } from '@nestjs/common';
import { InjectKysely } from 'nestjs-kysely';
import { KyselyDB, KyselyTransaction } from '@docmost/db/types/kysely.types';
import { DB } from '@docmost/db/types/db';
import {
  ApiKey,
  InsertableApiKey,
  UpdatableApiKey,
} from '@docmost/db/types/entity.types';
import { PaginationOptions } from '@docmost/db/pagination/pagination-options';
import { executeWithPagination } from '@docmost/db/pagination/pagination';
import { ExpressionBuilder } from 'kysely';
import { jsonObjectFrom } from 'kysely/helpers/postgres';
import { dbOrTx } from '../../utils';

@Injectable()
export class ApiKeyRepo {
  constructor(@InjectKysely() private readonly db: KyselyDB) {}

  withCreator(eb: ExpressionBuilder<DB, 'apiKeys'>) {
    return jsonObjectFrom(
      eb
        .selectFrom('users')
        .select(['users.id', 'users.name', 'users.email', 'users.avatarUrl'])
        .whereRef('users.id', '=', 'apiKeys.creatorId'),
    ).as('creator');
  }

  async findById(apiKeyId: string): Promise<ApiKey | undefined> {
    return this.db
      .selectFrom('apiKeys')
      .selectAll('apiKeys')
      .select((eb) => this.withCreator(eb))
      .where('apiKeys.id', '=', apiKeyId)
      .where('apiKeys.deletedAt', 'is', null)
      .executeTakeFirst();
  }

  async findPaginated(opts: {
    workspaceId: string;
    userId?: string;
    adminView?: boolean;
    pagination: PaginationOptions;
  }) {
    const { workspaceId, userId, adminView, pagination } = opts;
    const query = this.db
      .selectFrom('apiKeys')
      .selectAll('apiKeys')
      .select((eb) => this.withCreator(eb))
      .where('apiKeys.workspaceId', '=', workspaceId)
      .where('apiKeys.deletedAt', 'is', null)
      .$if(!adminView, (qb) => qb.where('apiKeys.creatorId', '=', userId))
      .orderBy('apiKeys.createdAt', 'desc');

    return executeWithPagination(query, {
      page: pagination.page,
      perPage: pagination.limit,
    });
  }

  async insertApiKey(
    insertable: InsertableApiKey,
    trx?: KyselyTransaction,
  ): Promise<ApiKey> {
    const db = dbOrTx(this.db, trx);
    return db
      .insertInto('apiKeys')
      .values(insertable)
      .returningAll()
      .executeTakeFirst();
  }

  async updateApiKey(
    apiKeyId: string,
    updates: UpdatableApiKey,
    trx?: KyselyTransaction,
  ): Promise<void> {
    const db = dbOrTx(this.db, trx);
    await db
      .updateTable('apiKeys')
      .set({ ...updates, updatedAt: new Date() })
      .where('id', '=', apiKeyId)
      .execute();
  }

  async revoke(apiKeyId: string, trx?: KyselyTransaction): Promise<void> {
    const db = dbOrTx(this.db, trx);
    await db
      .updateTable('apiKeys')
      .set({ deletedAt: new Date() })
      .where('id', '=', apiKeyId)
      .execute();
  }

  async touchLastUsed(apiKeyId: string): Promise<void> {
    await this.db
      .updateTable('apiKeys')
      .set({ lastUsedAt: new Date() })
      .where('id', '=', apiKeyId)
      .execute();
  }
}
