import { Module, Global } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { LlmLanguageProvider } from './llm.provider';
import { OpenAIService } from './openai.service';
import { GeminiService } from './gemini.service';

@Global()
@Module({
  imports: [ConfigModule],
  providers: [LlmLanguageProvider, OpenAIService, GeminiService],
  exports: [LlmLanguageProvider],
})
export class LLMCoreModule {}
