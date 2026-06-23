import { Injectable, InternalServerErrorException } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import * as Handlebars from 'handlebars';

@Injectable()
export class TemplateService {
  private readonly templateDir = path.join(
    __dirname,
    'templates',
  );

  /**
   * Compile a Handlebars template and return the rendered HTML string.
   *
   * The template is wrapped in `base.hbs` so every email shares the same
   * header / footer shell. Individual templates should provide the inner
   * `{{{body}}}` content.
   *
   * @param templateName  File name without the `.hbs` extension (e.g. `'password-reset'`)
   * @param context       Key/value pairs injected into the template
   */
  async render(
    templateName: string,
    context: Record<string, unknown>,
  ): Promise<string> {
    const bodyHtml = this.loadAndCompile(templateName, context);
    const fullHtml = this.loadAndCompile('base', { body: bodyHtml, ...context });
    return fullHtml;
  }

  // ─── Private helpers ────────────────────────────────────────────────────

  private loadAndCompile(
    name: string,
    context: Record<string, unknown>,
  ): string {
    const filePath = path.join(this.templateDir, `${name}.hbs`);

    if (!fs.existsSync(filePath)) {
      throw new InternalServerErrorException(
        `Email template "${name}" not found at ${filePath}`,
      );
    }

    const source = fs.readFileSync(filePath, 'utf8');
    const compiled = Handlebars.compile(source);
    return compiled(context);
  }
}
