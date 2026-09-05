import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { ListAdminOffersQueryDto } from './list-admin-offers-query.dto';

describe('ListAdminOffersQueryDto', () => {
  it('parses the explicit true/false query values', async () => {
    const featured = plainToInstance(ListAdminOffersQueryDto, {
      featured: 'false',
    });

    expect(featured.featured).toBe(false);
    expect(await validate(featured)).toHaveLength(0);
  });

  it('rejects an arbitrary value instead of silently treating it as false', async () => {
    const featured = plainToInstance(ListAdminOffersQueryDto, {
      featured: 'not-a-boolean',
    });

    expect(featured.featured).toBe('not-a-boolean');
    expect(await validate(featured)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ property: 'featured' }),
      ]),
    );
  });
});
