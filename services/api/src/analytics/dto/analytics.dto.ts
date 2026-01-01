export interface DashboardData {
  avatar: string;
  calories: { target: number; current: number; remaining: number };
  macros: {
    protein: { current: number; target: number };
    fat: { current: number; target: number };
    carbs: { current: number; target: number };
  };
  biometrics: { waterMl: number; weightKg: number | null };
  recentMeals: Array<{
    id: string;
    type: 'MEAL' | 'SCAN';
    name: string;
    kcal: number | null;
    time: Date;
    imageUrl: string | null;
    meta?: any;
  }>;
}

export interface AnalyticsData {
  summary: {
    nutritionalHealthScore: number;
    totalPts: number;
    totalProductsAnalysed: number;
    currentStreak: number;
  };
  novaDistribution: Array<{
    group: number;
    label: string;
    count: number;
  }>;
  trends: any[];
}

export class ScanHistoryItem {
  id: string;
  type: 'SCAN' | 'MEAL';
  name: string;
  imageUrl: string | null;
  time: Date;
  calories?: number | null;
  novaScore?: number | null;
}

export class PaginatedHistoryResponse {
  data: ScanHistoryItem[];
  meta: {
    total: number;
    page: number;
    lastPage: number;
    hasNextPage: boolean;
  };
}
