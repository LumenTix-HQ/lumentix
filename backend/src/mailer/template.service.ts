import { Injectable, Logger } from '@nestjs/common';
import * as Handlebars from 'handlebars';

@Injectable()
export class TemplateService {
  private readonly logger = new Logger(TemplateService.name);

  render(templateName: string, context: Record<string, any>): string {
    const templateSource = `<div style="font-family: sans-serif;"><h1>{{title}}</h1><p>{{body}}</p></div>`;
    const compiled = Handlebars.compile(templateSource);
    return compiled(context);
  }
}
