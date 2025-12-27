import { Injectable } from '@nestjs/common';

@Injectable()
export class BadgeGenerator {
  private getColours(tier: number) {
    switch (tier) {
      case 1: // Bronze
        return {
          start: '#E7CFA0',
          end: '#8C5822',
          stroke: '#593612',
          text: '#593612',
        };
      case 2: // Silver
        return {
          start: '#F5F7FA',
          end: '#9BA3B3',
          stroke: '#565C68',
          text: '#3A414E',
        };
      case 3: // Gold
        return {
          start: '#FFEC8B',
          end: '#D4AF37',
          stroke: '#8A6E0A',
          text: '#685002',
        };
      case 4: // Platinum / Diamond
        return {
          start: '#E0FFFF',
          end: '#00BFFF',
          stroke: '#005F87',
          text: '#004466',
        };
      default: // Basic
        return { start: '#EEE', end: '#CCC', stroke: '#999', text: '#333' };
    }
  }

  generateBadge(tier: number, label: string, iconEmoji: string = '🏆'): string {
    const c = this.getColours(tier);

    // An SVG with a Hexagon shape, a gradient fill, and a "shine" effect
    const svg = `
      <svg xmlns="http://www.w3.org/2000/svg" width="200" height="200" viewBox="0 0 200 200">
        <defs>
          <linearGradient id="grad${tier}" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" style="stop-color:${c.start};stop-opacity:1" />
            <stop offset="100%" style="stop-color:${c.end};stop-opacity:1" />
          </linearGradient>
          <filter id="shadow">
            <feDropShadow dx="2" dy="4" stdDeviation="3" flood-opacity="0.3"/>
          </filter>
        </defs>

        <path d="M100 20 L180 65 L180 155 L100 200 L20 155 L20 65 Z" 
              fill="url(#grad${tier})" 
              stroke="${c.stroke}" 
              stroke-width="4" 
              filter="url(#shadow)" />

        <path d="M100 30 L170 70 L170 150 L100 190 L30 150 L30 70 Z" 
              fill="none" 
              stroke="white" 
              stroke-opacity="0.3" 
              stroke-width="2" />

        <text x="100" y="115" font-size="60" text-anchor="middle" style="filter: drop-shadow(0px 2px 2px rgba(0,0,0,0.2));">
          ${iconEmoji}
        </text>

        <rect x="40" y="135" width="120" height="30" rx="15" fill="${c.stroke}" opacity="0.9" />
        <text x="100" y="156" font-family="Arial, sans-serif" font-size="14" font-weight="bold" fill="white" text-anchor="middle">
          ${label.toUpperCase()}
        </text>

        <ellipse cx="100" cy="50" rx="40" ry="20" fill="white" fill-opacity="0.2" />
      </svg>
    `.trim();

    const base64 = Buffer.from(svg).toString('base64');
    return `data:image/svg+xml;base64,${base64}`;
  }
}
