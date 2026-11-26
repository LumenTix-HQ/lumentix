import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { BackgroundPattern } from '../entities/ticket-design.entity';
import { SaveTicketDesignDto } from './save-ticket-design.dto';

describe('SaveTicketDesignDto', () => {
  it('rejects layout coordinates outside the ticket bounds', async () => {
    const dto = plainToInstance(SaveTicketDesignDto, {
      name: 'Theme',
      layout: [{ key: 'event_title', x: 101, y: 20 }],
    });

    const errors = await validate(dto);

    expect(errors.some((error) => error.property === 'layout')).toBe(true);
  });

  it('requires an HTTPS image URL for a custom-image background', async () => {
    const dto = plainToInstance(SaveTicketDesignDto, {
      name: 'Theme',
      backgroundPattern: BackgroundPattern.CUSTOM_IMAGE,
      backgroundImageUrl: 'http://example.com/image.jpg',
    });

    const errors = await validate(dto);

    expect(errors.some((error) => error.property === 'backgroundImageUrl')).toBe(true);
  });
});
