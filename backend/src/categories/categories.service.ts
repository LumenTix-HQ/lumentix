import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Category } from './entities/category.entity';

@Injectable()
export class CategoriesService {
  constructor(
    @InjectRepository(Category)
    private readonly categoryRepo: Repository<Category>,
  ) {}

  async findAll(): Promise<(Category & { eventCount: number })[]> {
    const rows = await this.categoryRepo
      .createQueryBuilder('c')
      .loadRelationCountAndMap('c.eventCount', 'c.events')
      .getMany();
    return rows as (Category & { eventCount: number })[];
  }

  async findByIds(ids: string[]): Promise<Category[]> {
    if (!ids.length) return [];
    return this.categoryRepo.findByIds(ids);
  }

  async seedDefaults(): Promise<void> {
    const defaults = [
      { name: 'Music', slug: 'music', description: 'Concerts, festivals, live performances' },
      { name: 'Technology', slug: 'technology', description: 'Conferences, hackathons, meetups' },
      { name: 'Sports', slug: 'sports', description: 'Sporting events and competitions' },
      { name: 'Arts', slug: 'arts', description: 'Art exhibitions and creative events' },
      { name: 'Food & Drink', slug: 'food-drink', description: 'Food festivals and tastings' },
      { name: 'Business', slug: 'business', description: 'Business conferences and networking' },
      { name: 'Education', slug: 'education', description: 'Workshops and learning events' },
      { name: 'Health', slug: 'health', description: 'Health and wellness events' },
    ];
    for (const d of defaults) {
      const exists = await this.categoryRepo.findOne({ where: { slug: d.slug } });
      if (!exists) {
        await this.categoryRepo.save(this.categoryRepo.create(d));
      }
    }
  }
}
