
import { Injectable, OnModuleInit, InternalServerErrorException } from '@nestjs/common';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as handlebars from 'handlebars';

@Injectable()
export class TemplateService implements OnModuleInit {
  private templates: Map<string, Handlebars.TemplateDelegate> = new Map();
  private baseTemplate: Handlebars.TemplateDelegate;

  async onModuleInit() {
    await this.loadTemplates();
  }

  private async loadTemplates() {
    const templatesDir = path.join(__dirname, 'templates');
    try {
      const files = await fs.readdir(templatesDir);
      for (const file of files) {
        if (file.endsWith('.hbs')) {
          const templatePath = path.join(templatesDir, file);
          const content = await fs.readFile(templatePath, 'utf-8');
          const templateName = path.basename(file, '.hbs');
          if (templateName === 'base') {
            this.baseTemplate = handlebars.compile(content);
          } else {
            this.templates.set(templateName, handlebars.compile(content));
          }
        }
      }
    } catch (error) {
      throw new InternalServerErrorException('Failed to load email templates.');
    }
  }

  render(templateName: string, context: any): string {
    const template = this.templates.get(templateName);
    if (!template) {
      throw new InternalServerErrorException(`Template "${templateName}" not found.`);
    }
    const body = template(context);
    if (this.baseTemplate) {
      return this.baseTemplate({ ...context, body });
    }
    return body;
  }
}