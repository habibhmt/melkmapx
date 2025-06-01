export * from './divar';

// Re-export House type from divar
export type { House } from './divar';

/* Commented out in favor of the House type from divar.ts
export interface House {
  id: string;
  title: string;
  price: number;
  pricePerMeter: number;
  area: number;
  rooms: number;
  floor: number;
  buildingAge: number;
  hasElevator: boolean;
  hasParking: boolean;
  hasStorage: boolean;
  location: {
    lat: number;
    lng: number;
  };
  description: string;
  address: string;
  imageUrls: string[];
  imageCount: number;
  token: string;
  locationType: string;
  isVerified: boolean;
  catType: string;
  seen: boolean;
  chatEnabled: boolean;
  isStockImage: boolean;
  approximateLocation: boolean;
  subtitle1: string;
  subtitle2: string;
  subtitle3: string;
  longPreviewTitle: string;
  shortPreviewTitle: string;
  crawledAt: string;
  rawData: any;
  
  // For compatibility with existing code
  size?: number;
  totalPrice?: number;
  roomCount?: number;
  neighborhood?: string;
  advertiser?: string;
  createdAt?: string;
  imageUrl?: string;
  subtitle?: string;
  chips?: string[];
  raw?: any;
}
*/