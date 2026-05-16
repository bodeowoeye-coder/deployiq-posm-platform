import OpenAI from "openai";
import type { AiExtraction } from "@/lib/types";

const fallbackExtraction: AiExtraction = {
  salonName: "",
  address: "",
  brandName: "",
  phone: "",
  stateRegion: "",
  visibleText: "",
  confidence: "low",
  note: ""
};

export async function extractBoardTextFromImage(imageUrl: string): Promise<AiExtraction> {
  if (!process.env.OPENAI_API_KEY) {
    return fallbackExtraction;
  }

  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

  try {
    const response = await openai.responses.create({
      model: process.env.OPENAI_MODEL || "gpt-5.2",
      input: [
        {
          role: "user",
          content: [
            {
              type: "input_text",
              text:
                "Extract deployment evidence from this installed dealer board photo. Return only JSON with salonName, address, brandName, phone, stateRegion, visibleText, confidence, and note. If text is not visible, use empty strings and briefly explain uncertainty in note."
            },
            {
              type: "input_image",
              image_url: imageUrl,
              detail: "high"
            }
          ]
        }
      ],
      text: {
        format: {
          type: "json_schema",
          name: "dealer_board_extraction",
          schema: {
            type: "object",
            additionalProperties: false,
            properties: {
              salonName: { type: "string" },
              address: { type: "string" },
              brandName: { type: "string" },
              phone: { type: "string" },
              stateRegion: { type: "string" },
              visibleText: { type: "string" },
              confidence: { type: "string", enum: ["low", "medium", "high"] },
              note: { type: "string" }
            },
            required: ["salonName", "address", "brandName", "phone", "stateRegion", "visibleText", "confidence", "note"]
          },
          strict: true
        }
      }
    });

    return JSON.parse(response.output_text) as AiExtraction;
  } catch {
    return fallbackExtraction;
  }
}
