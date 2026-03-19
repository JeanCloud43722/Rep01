import { logger } from "./logger";

const IMAGE_GEN_RATE_LIMIT = 5;
let imageGenCount = 0;

export function resetImageGenCount(): void {
  imageGenCount = 0;
}

export async function generatePlaceholderImage(product: {
  name: string;
  description?: string | null;
  category: string;
}): Promise<string | null> {
  if (!process.env.IMAGE_GEN_API_KEY) {
    return null;
  }

  if (imageGenCount >= IMAGE_GEN_RATE_LIMIT) {
    logger.debug("[ImageGen] Rate limit reached — skipping", {
      source: "imagegen",
      name: product.name,
    });
    return null;
  }

  imageGenCount++;

  const prompt = `Professional food photography of ${product.name}${
    product.description ? `, ${product.description}` : ""
  }, ${product.category} dish, restaurant style, appetizing, well-lit, white background`;

  logger.debug("[ImageGen] Generating image", {
    source: "imagegen",
    name: product.name,
    prompt,
  });

  try {
    const response = await fetch("https://api.stability.ai/v1/generation/stable-diffusion-v1-6/text-to-image", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        Authorization: `Bearer ${process.env.IMAGE_GEN_API_KEY}`,
      },
      body: JSON.stringify({
        text_prompts: [{ text: prompt, weight: 1 }],
        cfg_scale: 7,
        height: 512,
        width: 512,
        samples: 1,
        steps: 30,
      }),
    });

    if (!response.ok) {
      throw new Error(`Image gen API ${response.status}: ${await response.text().catch(() => "")}`);
    }

    const result = (await response.json()) as { artifacts?: Array<{ base64: string }> };
    const base64 = result.artifacts?.[0]?.base64;
    if (!base64) return null;

    return `data:image/png;base64,${base64}`;
  } catch (err) {
    logger.warn("[ImageGen] Failed", { source: "imagegen", name: product.name, err: String(err) });
    return null;
  }
}
