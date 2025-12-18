import { IsString, IsNotEmpty, MinLength } from 'class-validator';

export class ProcessImageScanDto {
  @IsString()
  @IsNotEmpty()
  @MinLength(1)
  userId: string;

  imageBuffer: Buffer;
}

export interface NovaClassification {
  processing_reasons?: any; // Made optional to fit fallback logic
  nova_group: number;
  confidence: number;
  contributing_ingredients?: string[]; // Added to match service usage
}

export interface AdditiveInfo {
  name: string;
  function: string;
  // Included 'Unknown' to match your fallback logic and Zod schema
  risk: 'Low' | 'Medium' | 'High' | 'Unknown';
  explanation?: string;
  eNumber?: string;
}

export interface GeminiAnalysis {
  nutriScore?: any;
  productName: string;
  additives: AdditiveInfo[];
  cleanRecipe: string;
  // FIX: Added '?' because Zod schema has .optional()
  estimatedShelfLife?: string;
  functionalCategories?: string[];
}

export interface ScanResult {
  id: string;
  userId: string;
  ingredients: string;
  novaScore: number;
  productName: string;
  additives: AdditiveInfo[];
  // Here it is required (string[]) because your service uses "|| []" to ensure it exists before saving
  functionalCategories: string[];
  cleanRecipe: string | null;
  imageUrl?: string | null; // Made optional/nullable to match Prisma
  rawText: string;
  ocrConfidence?: number | null;
  mlConfidence?: number | null;
  createdAt: Date;
}

export interface ServiceHealth {
  service: string;
  status: 'healthy' | 'degraded' | 'unhealthy';
  latencyMs?: number;
  lastChecked: Date;
  details?: string;
}
