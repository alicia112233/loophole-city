import { z } from "zod";
import { ACTION_TYPES, CITIZEN_IDS } from "./types";

export const DayPlanSchema = z.object({
  law_terms: z.object({
    unit: z.string(),
    unit_plural: z.string(),
    treasury_pays_per_unit: z.number(),
    citizen_pays_per_unit: z.number(),
    plain_english: z.string(),
  }),
  citizens: z.array(
    z.object({
      id: z.enum(CITIZEN_IDS),
      reasoning: z.string(),
      bubble: z.string(),
    }),
  ),
  actions: z.array(
    z.object({
      citizen: z.enum(CITIZEN_IDS),
      type: z.enum(ACTION_TYPES),
      units: z.number(),
      counterparty: z.enum([...CITIZEN_IDS, "none"]),
      price: z.number(),
      note: z.string(),
    }),
  ),
  headline: z.string(),
  subhead: z.string(),
  mayor_quote: z.string(),
  town_mood: z.number(),
});

export const EndingSchema = z.object({
  headline: z.string(),
  subhead: z.string(),
  story: z.string(),
  epitaph: z.string(),
});
export type EndingCopy = z.infer<typeof EndingSchema>;
