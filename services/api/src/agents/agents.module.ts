import { Module } from '@nestjs/common';
import { NutritionController } from './controllers/nutrition.controller';
import { PlannerController } from './controllers/planner.controller';
import { RecipeController } from './controllers/recipe.controller';
import { NutritionistAgent } from './nutritionist.agent';
import { PlannerAgent } from './planner.agent';
import { RecipeAgent } from './recipe.agent';
import { LLMCoreModule } from '../llm-core/llm-core.module';
import { PrismaModule } from '../common/prisma/prisma.module';
import { CloudinaryModule } from '../common/cloudinary/cloudinary.module';

@Module({
  imports: [LLMCoreModule, PrismaModule, CloudinaryModule],
  controllers: [NutritionController, PlannerController, RecipeController],
  providers: [NutritionistAgent, PlannerAgent, RecipeAgent],
  exports: [NutritionistAgent, PlannerAgent, RecipeAgent],
})
export class AgentsModule {}
