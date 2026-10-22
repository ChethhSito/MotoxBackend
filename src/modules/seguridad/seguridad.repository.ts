import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DatabaseService } from '../../infrastructure/database/database.service.js';
import { Actor, UserRole } from './actor.js';

interface UserRow {
  uid: string;
  role: UserRole;
  active: boolean;
  display_name: string;
  email: string | null;
  phone: string | null;
}

@Injectable()
export class SeguridadRepository {
  constructor(private readonly database: DatabaseService) {}

  async findOrCreate(
    uid: string,
    email?: string,
    displayName?: string,
    phone?: string,
  ): Promise<Actor> {
    const existing = await this.database.query<UserRow>(
      'SELECT uid, role, active, display_name, email, phone FROM users WHERE uid = $1',
      [uid],
    );
    if (existing.rows[0]) return this.toActor(existing.rows[0]);
    const inserted = await this.database.query<UserRow>(
      `INSERT INTO users (uid, email, display_name, phone)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (uid) DO UPDATE SET uid = EXCLUDED.uid
       RETURNING uid, role, active, display_name, email, phone`,
      [uid, email ?? null, displayName ?? '', phone ?? null],
    );
    return this.toActor(inserted.rows[0]);
  }

  async profile(uid: string) {
    const user = await this.database.query<UserRow>(
      'SELECT uid, role, active, display_name, email, phone FROM users WHERE uid = $1',
      [uid],
    );
    const ratings = await this.database.query<{
      role: string;
      service_type: string;
      count: string;
      average: string | null;
    }>(
      `SELECT role, service_type, count(*)::text AS count,
              round(avg(score), 2)::text AS average
       FROM ratings WHERE to_uid = $1 GROUP BY role, service_type`,
      [uid],
    );
    return {
      ...user.rows[0],
      ratings: ratings.rows.map((row) => ({
        role: row.role,
        serviceType: row.service_type,
        count: Number(row.count),
        average: Number(row.average),
      })),
    };
  }

  async setRole(
    adminUid: string,
    targetUid: string,
    role: 'client' | 'driver',
  ) {
    if (adminUid === targetUid) {
      throw new ConflictException(
        'Un administrador no puede cambiar su propio rol',
      );
    }
    return this.database.transaction(async (client) => {
      const current = await client.query<UserRow>(
        'SELECT uid, role, active, display_name, email, phone FROM users WHERE uid=$1 FOR UPDATE',
        [targetUid],
      );
      const user = current.rows[0];
      if (!user) throw new NotFoundException('Usuario no encontrado');
      if (user.role === 'admin') {
        throw new ConflictException(
          'El rol de administrador se gestiona fuera de la API',
        );
      }
      if (user.role === role) return this.toActor(user);
      if (user.role === 'driver' && role === 'client') {
        const active = await client.query(
          `SELECT 1 FROM rides WHERE driver_uid=$1
           AND status IN ('accepted','arrived','ongoing','waiting_verification') LIMIT 1`,
          [targetUid],
        );
        if (active.rowCount) {
          throw new ConflictException('El conductor tiene un viaje activo');
        }
      }
      const updated = await client.query<UserRow>(
        'UPDATE users SET role=$2, updated_at=now() WHERE uid=$1 RETURNING uid, role, active, display_name, email, phone',
        [targetUid, role],
      );
      await client.query(
        'INSERT INTO user_role_events (target_uid, actor_uid, previous_role, next_role) VALUES ($1,$2,$3,$4)',
        [targetUid, adminUid, user.role, role],
      );
      return this.toActor(updated.rows[0]);
    });
  }

  async reviews(uid: string, limit: number) {
    const user = await this.database.query('SELECT 1 FROM users WHERE uid=$1', [
      uid,
    ]);
    if (!user.rowCount) throw new NotFoundException('Usuario no encontrado');
    const result = await this.database.query<{
      id: string;
      role: string;
      service_type: string;
      score: string;
      comment: string;
      badges: string[];
      created_at: Date;
      reviewer_name: string;
    }>(
      `SELECT r.id, r.role, r.service_type, r.score, r.comment,
              r.badges, r.created_at, u.display_name AS reviewer_name
       FROM ratings r JOIN users u ON u.uid=r.from_uid
       WHERE r.to_uid=$1 ORDER BY r.created_at DESC, r.id DESC LIMIT $2`,
      [uid, Math.min(Math.max(limit, 1), 50)],
    );
    return result.rows.map((row) => ({
      id: row.id,
      role: row.role,
      serviceType: row.service_type,
      score: Number(row.score),
      comment: row.comment,
      badges: row.badges,
      createdAt: row.created_at,
      reviewerName: row.reviewer_name,
    }));
  }

  private toActor(row: UserRow): Actor {
    return {
      uid: row.uid,
      role: row.role,
      active: row.active,
      displayName: row.display_name,
    };
  }
}
