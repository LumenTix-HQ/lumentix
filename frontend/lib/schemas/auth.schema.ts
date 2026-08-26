import { z } from 'zod';

// Shared auth form schemas, colocated with the other feature schemas
// (create-event.schema.ts) so every form validates via react-hook-form + zod.

export const loginSchema = z.object({
  email: z.string().email('Enter a valid email address'),
  password: z.string().min(1, 'Password is required'),
});

export type LoginFormValues = z.infer<typeof loginSchema>;

export const registerSchema = z
  .object({
    email: z.string().email('Enter a valid email address'),
    displayName: z
      .string()
      .min(2, 'Display name must be at least 2 characters')
      .or(z.literal('')),
    password: z
      .string()
      .min(8, 'Password must be at least 8 characters')
      .regex(/\d/, 'Password must contain at least one number'),
    confirmPassword: z.string(),
  })
  .refine((d) => d.password === d.confirmPassword, {
    message: 'Passwords do not match',
    path: ['confirmPassword'],
  });

export type RegisterFormValues = z.infer<typeof registerSchema>;
