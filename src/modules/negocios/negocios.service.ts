import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { Actor } from '../seguridad/actor.js';
import type { QueryResultRow } from 'pg';
import { BuscarNegociosDto, NegocioDto } from './dto/negocio.dto.js';
import { NegociosRepository } from './negocios.repository.js';

export type BusinessKind = 'workshop' | 'store';

interface BusinessRow extends QueryResultRow {
  id: string;
  owner_uid: string;
  kind: BusinessKind;
  name: string;
  phone: string;
  latitude: number;
  longitude: number;
  hours: string;
  services: string[];
  status: string;
  created_at: Date;
  updated_at: Date;
}

@Injectable()
export class NegociosService {
  constructor(private readonly businesses: NegociosRepository) {}

  async nearby(kind: BusinessKind, query: BuscarNegociosDto) {
    const result = await this.businesses.query<
      BusinessRow & { distance_km: number }
    >(
      `SELECT b.*, 6371 * acos(least(1, greatest(-1,
        sin(radians($2)) * sin(radians(latitude)) +
        cos(radians($2)) * cos(radians(latitude)) *
        cos(radians(longitude) - radians($3))
       ))) AS distance_km
       FROM businesses b WHERE kind=$1 AND status='approved'
       ORDER BY distance_km LIMIT 100`,
      [kind, query.lat, query.lng],
    );
    return result.rows
      .filter((row) => row.distance_km <= query.radiusKm)
      .map((row) => ({ ...this.serialize(row), distanceKm: row.distance_km }));
  }

  async mine(actor: Actor, kind: BusinessKind) {
    const result = await this.businesses.query<BusinessRow>(
      'SELECT * FROM businesses WHERE owner_uid=$1 AND kind=$2 ORDER BY created_at DESC',
      [actor.uid, kind],
    );
    return result.rows.map((row) => this.serialize(row));
  }

  async create(actor: Actor, kind: BusinessKind, dto: NegocioDto) {
    const result = await this.businesses.query<BusinessRow>(
      `INSERT INTO businesses (
        owner_uid, kind, name, phone, latitude, longitude, hours, services
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
      [
        actor.uid,
        kind,
        dto.name,
        dto.phone,
        dto.latitude,
        dto.longitude,
        dto.hours,
        dto.services,
      ],
    );
    return this.serialize(result.rows[0]);
  }

  async update(actor: Actor, kind: BusinessKind, id: string, dto: NegocioDto) {
    return this.businesses.transaction(async (client) => {
      const existing = await client.query<BusinessRow>(
        'SELECT * FROM businesses WHERE id=$1 AND kind=$2 FOR UPDATE',
        [id, kind],
      );
      const business = existing.rows[0];
      if (!business) throw new NotFoundException('Negocio no encontrado');
      if (business.owner_uid !== actor.uid) throw new ForbiddenException();
      const result = await client.query<BusinessRow>(
        `UPDATE businesses SET name=$2, phone=$3, latitude=$4, longitude=$5,
         hours=$6, services=$7, status='pending', approved_by=NULL, updated_at=now()
         WHERE id=$1 RETURNING *`,
        [
          id,
          dto.name,
          dto.phone,
          dto.latitude,
          dto.longitude,
          dto.hours,
          dto.services,
        ],
      );
      return this.serialize(result.rows[0]);
    });
  }

  async approve(actor: Actor, id: string) {
    if (actor.role !== 'admin') throw new ForbiddenException();
    const result = await this.businesses.query<BusinessRow>(
      `UPDATE businesses SET status='approved', approved_by=$2,
       updated_at=now() WHERE id=$1 AND status='pending' RETURNING *`,
      [id, actor.uid],
    );
    if (!result.rows[0]) throw new ConflictException('Negocio no pendiente');
    return this.serialize(result.rows[0]);
  }

  private serialize(row: BusinessRow) {
    return {
      id: row.id,
      ownerId: row.owner_uid,
      kind: row.kind,
      name: row.name,
      phone: row.phone,
      latitude: row.latitude,
      longitude: row.longitude,
      hours: row.hours,
      services: row.services,
      status: row.status,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }
}
