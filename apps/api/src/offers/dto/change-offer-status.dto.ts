import { IsIn } from 'class-validator';

/** Owners can pause, resume, or archive their campaigns. Date-driven states are API controlled. */
export class ChangeOfferStatusDto {
  @IsIn(['PAUSED', 'ACTIVE', 'ARCHIVED'])
  status!: 'PAUSED' | 'ACTIVE' | 'ARCHIVED';
}
