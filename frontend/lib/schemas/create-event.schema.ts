import { z } from "zod";

export const sponsorTierSchema = z.object({
    name: z.string().min(1, "Tier name is required"),
    minAmount: z.number().positive("Must be > 0"),
    maxContributors: z.number().int().positive().optional(),
    benefits: z.string().optional(),
});

export type SponsorTierInput = z.input<typeof sponsorTierSchema>;
export type SponsorTierValues = z.output<typeof sponsorTierSchema>;

export const createEventSchema = z
    .object({
        title: z.string().min(3, "Title must be at least 3 characters"),
        description: z
            .string()
            .max(2000, "Description is too long")
            .optional()
            .or(z.literal("")),
        location: z
            .string()
            .max(255, "Location is too long")
            .optional()
            .or(z.literal("")),
        startDate: z.string().min(1, "Start date is required"),
        endDate: z.string().min(1, "End date is required"),
        ticketPrice: z.number().min(0, "Price cannot be negative"),
        currency: z
            .string()
            .length(3, "Currency must be a 3-letter code")
            .transform((v) => v.toUpperCase()),
        status: z.enum(["draft", "published", "completed", "cancelled"]),
        authToken: z.string().optional(),
        walletPublicKey: z.string().optional(),
        sponsorshipEnabled: z.boolean(),
        sponsorTiers: z.array(sponsorTierSchema).default([]),
    })
    .superRefine((data, ctx) => {
        const start = new Date(data.startDate);
        const end = new Date(data.endDate);

        if (Number.isNaN(start.getTime())) {
            ctx.addIssue({
                code: z.ZodIssueCode.custom,
                path: ["startDate"],
                message: "Start date must be valid",
            });
        }
        if (Number.isNaN(end.getTime())) {
            ctx.addIssue({
                code: z.ZodIssueCode.custom,
                path: ["endDate"],
                message: "End date must be valid",
            });
        }
        if (
            !Number.isNaN(start.getTime()) &&
            !Number.isNaN(end.getTime()) &&
            end <= start
        ) {
            ctx.addIssue({
                code: z.ZodIssueCode.custom,
                path: ["endDate"],
                message: "End date must be after start date",
            });
        }
        if (data.sponsorshipEnabled && data.sponsorTiers.length === 0) {
            ctx.addIssue({
                code: z.ZodIssueCode.custom,
                path: ["sponsorTiers"],
                message: "Add at least one sponsor tier or disable sponsor options",
            });
        }
    });

export type CreateEventFormInput = z.input<typeof createEventSchema>;
export type CreateEventFormValues = z.output<typeof createEventSchema>;

export const defaultCreateEventValues: CreateEventFormInput = {
    title: "",
    description: "",
    location: "",
    startDate: "",
    endDate: "",
    ticketPrice: 0,
    currency: "USD",
    status: "draft",
    authToken: "",
    walletPublicKey: "",
    sponsorshipEnabled: false,
    sponsorTiers: [],
};
