import { Injectable, OnModuleInit, Logger } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import * as Handlebars from 'handlebars';

/** Names of all required email templates. Validated eagerly at startup. */
const REQUIRED_TEMPLATES = [
  'base',
  'password-reset',
  'registration-confirmed',
  'refund-issued',
  'ticket-ready',
  'event-cancelled',
] as const;

type TemplateName = (typeof REQUIRED_TEMPLATES)[number];

@Injectable()
export class TemplateService implements OnModuleInit {
  private readonly logger = new Logger(TemplateService.name);
  private readonly templatesDir = path.join(__dirname, 'templates');
  private readonly compiled = new Map<string, Handlebars.TemplateDelegate>();
  private baseTemplate!: Handlebars.TemplateDelegate;

  onModuleInit(): void {
    this.loadTemplates();
  }

  /**
   * Render a named template with the given context.
   * The rendered body is wrapped in the base layout.
   *
   * @param name     Template name (without .hbs extension)
   * @param context  Variables available inside the template
   */
  render(name: string, context: Record<string, unknown> = {}): string {
    const bodyTemplate = this.compiled.get(name);
    if (!bodyTemplate) {
      throw new Error(
        `Email template "${name}" not found. Available: ${[...this.compiled.keys()].join(', ')}`,
      );
    }

    const body = bodyTemplate(context);
    return this.baseTemplate({
      ...context,
      body,
      year: new Date().getFullYear(),
    });
  }

  // ─── Private ─────────────────────────────────────────────────────────────

  private loadTemplates(): void {
    for (const name of REQUIRED_TEMPLATES) {
      const filePath = path.join(this.templatesDir, `${name}.hbs`);
      if (!fs.existsSync(filePath)) {
        throw new Error(
          `Required email template missing: ${filePath}. ` +
            `Ensure all templates exist before starting the application.`,
        );
      }
      const source = fs.readFileSync(filePath, 'utf8');
      const compiled = Handlebars.compile(source);

      if (name === 'base') {
        this.baseTemplate = compiled;
      } else {
        this.compiled.set(name, compiled);
      }
    }

    this.logger.log(
      `Loaded ${this.compiled.size} email templates from ${this.templatesDir}`,
    );
  }
}
