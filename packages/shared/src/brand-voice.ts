/**
 * Brand Voice Hook Interface
 * 
 * Stub interface for tenant-specific brand voice and template customization.
 * Another team implements this in Phase 2/3 for white-label support.
 * 
 * The analysis service calls these hooks; implementations are injected at runtime.
 */

import type { MeetingAnalysis } from './analysis.js';

/**
 * Brand voice configuration for a tenant
 */
export interface BrandVoice {
  /** Tenant ID */
  tenantId: string;
  
  /** Brand name to use in communications */
  brandName: string;
  
  /** Tone of voice for AI-generated content */
  tone: 'professional' | 'friendly' | 'casual' | 'formal';
  
  /** Custom instructions for Claude analysis */
  analysisInstructions?: string;
  
  /** Custom email template ID */
  emailTemplateId?: string;
  
  /** Bot name format (must disclose recording per consent requirements) */
  botNameFormat?: string;
}

/**
 * Brand voice hook interface
 * Implementations provided by the white-label team
 */
export interface BrandVoiceHook {
  /**
   * Get brand voice configuration for a tenant
   * @param tenantId - The tenant ID
   * @returns Brand voice config or null if using defaults
   */
  getBrandVoice(tenantId: string): Promise<BrandVoice | null>;
  
  /**
   * Format analysis output according to brand voice
   * @param analysis - Raw analysis from Claude
   * @param brandVoice - Tenant brand voice config
   * @returns Formatted analysis
   */
  formatAnalysis(analysis: MeetingAnalysis, brandVoice: BrandVoice): MeetingAnalysis;
  
  /**
   * Get email template for a tenant
   * @param tenantId - The tenant ID
   * @param templateType - Type of email (recap, invite, etc.)
   * @returns Template HTML or null if using default
   */
  getEmailTemplate(tenantId: string, templateType: string): Promise<string | null>;
}

/**
 * Default brand voice configuration
 */
export const DEFAULT_BRAND_VOICE: BrandVoice = {
  tenantId: '',
  brandName: '[PRODUCT NAME]',
  tone: 'professional',
};

/**
 * No-op default implementation of BrandVoiceHook
 * Returns null/passthrough for all methods
 */
export const defaultBrandVoiceHook: BrandVoiceHook = {
  async getBrandVoice(_tenantId: string): Promise<BrandVoice | null> {
    return null;
  },
  
  formatAnalysis(analysis: MeetingAnalysis, _brandVoice: BrandVoice): MeetingAnalysis {
    return analysis;
  },
  
  async getEmailTemplate(_tenantId: string, _templateType: string): Promise<string | null> {
    return null;
  },
};

/**
 * Global hook instance - can be replaced at runtime
 */
let currentHook: BrandVoiceHook = defaultBrandVoiceHook;

/**
 * Set the active brand voice hook implementation
 * @param hook - The hook implementation to use
 */
export function setBrandVoiceHook(hook: BrandVoiceHook): void {
  currentHook = hook;
}

/**
 * Get the active brand voice hook
 * @returns The current hook implementation
 */
export function getBrandVoiceHook(): BrandVoiceHook {
  return currentHook;
}
