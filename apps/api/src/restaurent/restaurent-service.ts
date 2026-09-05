import {
    ForbiddenException,
    Inject,
    Injectable,
    NotFoundException,
  } from '@nestjs/common';
  import { and, eq, like, or } from 'drizzle-orm';
  import type { NeonHttpDatabase } from 'drizzle-orm/neon-http';
  import type { schema as RelationsSchema } from '../db/relations';
  import * as schema from '../db/schema';
  import { CreateRestaurantDto } from './dto/create-restaurent.dto';
  import { UpdateRestaurantDto } from './dto/update-restaurent.dto';
  
  @Injectable()
  export class RestaurantsService {
    constructor(
      @Inject('DB') private db: NeonHttpDatabase<typeof RelationsSchema>,
    ) {}
  
    async create(ownerId: string, dto: CreateRestaurantDto) { 
      const [existing] = await this.db
        .select()
        .from(schema.restaurants)
        .where(eq(schema.restaurants.ownerId, ownerId));
  
      if (existing) {
        throw new ForbiddenException('You already have a restaurant');
      }
  
      const [restaurant] = await this.db
        .insert(schema.restaurants)
        .values({
          ownerId,
          name: dto.name,
          description: dto.description,
          address: dto.address,
          latitude: dto.latitude,
          longitude: dto.longitude,
          cuisineType: dto.cuisineType,
          imageUrl: dto.imageUrl,
        })
        .returning();
  
      return restaurant;
    }

  async findMine(ownerId: string) {
    const [restaurant] = await this.db
      .select()
      .from(schema.restaurants)
      .where(eq(schema.restaurants.ownerId, ownerId));
      return restaurant??null;

  }
  async findById(id: string) {
    const [restaurant] = await this.db
      .select()
      .from(schema.restaurants)
      .where(eq(schema.restaurants.id, id));
      return restaurant??null;
      if (!restaurant) {
        throw new NotFoundException('Restaurant not found');
      }
      return restaurant;
    }
    async findAll(search?: string) {
      // if search is provided, filter by name OR cuisine type (case-insensitive)
      // only return open restaurants to customers
      if (search) {
        return this.db
          .select()
          .from(schema.restaurants)
          .where(
            and(
              eq(schema.restaurants.isOpen, true),
              or(
                like(schema.restaurants.name, `%${search}%`),
                like(schema.restaurants.cuisineType, `%${search}%`)
              )
            )
          );
      }
    
      return this.db
        .select()
        .from(schema.restaurants)
        .where(eq(schema.restaurants.isOpen, true));
    }
    async update(id: string, ownerId: string, dto: UpdateRestaurantDto) {
        const [restaurant] = await this.db
        .select()
        .from(schema.restaurants)
        .where(eq(schema.restaurants.id, id));
    
        if (!restaurant) throw new NotFoundException('Restaurant not found');
    
        if (restaurant.ownerId !== ownerId) {
            throw new ForbiddenException('You do not own this restaurant');
        }
    
        const [updated] = await this.db
            .update(schema.restaurants)
            .set({ 
            ...dto,
            updatedAt: new Date(),
            })
            .where(eq(schema.restaurants.id, id))
            .returning();
    
        return updated;
    }
    
   
   }
