import * as fs from 'fs';
import * as path from 'path';

interface HousePost {
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
}

// File storage utilities - Use static path for Cloudflare Workers
const DATA_DIR = './data';

// Helper to check if we're in Node.js environment
function isNodeEnvironment(): boolean {
  return typeof process !== 'undefined' && process.versions && !!process.versions.node;
}

// Load posts from file (only works in Node.js environment)
export function loadPostsFromFile(polygonId: string): HousePost[] {
  if (!isNodeEnvironment()) {
    console.warn('File system operations not available in this environment');
    return [];
  }
  
  try {
    const filePath = path.join(DATA_DIR, `polygon_${polygonId}_posts.json`);
    if (fs.existsSync(filePath)) {
      const data = fs.readFileSync(filePath, 'utf-8');
      return JSON.parse(data);
    }
  } catch (error) {
    console.error('Error loading posts from file:', error);
  }
  return [];
}

// Save posts to file (only works in Node.js environment)
export function savePostsToFile(polygonId: string, posts: HousePost[]): void {
  if (!isNodeEnvironment()) {
    console.warn('File system operations not available in this environment');
    return;
  }
  
  try {
    // Ensure data directory exists
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    
    const filePath = path.join(DATA_DIR, `polygon_${polygonId}_posts.json`);
    fs.writeFileSync(filePath, JSON.stringify(posts, null, 2));
    console.log(`✅ Saved ${posts.length} posts to ${filePath}`);
  } catch (error) {
    console.error('Error saving posts to file:', error);
  }
}

// Utility functions for parsing
function parsePrice(priceStr: string): number {
  if (!priceStr) return 0;
  const normalized = priceStr
    .replace(/[^\d٫\.]/g, '')
    .replace('٫', '.');
  return parseFloat(normalized) || 0;
}

function parseArea(chips: any[]): number {
  if (!chips) return 0;
  for (const chip of chips) {
    if (chip.title && chip.title.includes('متر')) {
      return parseInt(chip.title.replace(/[^\d]/g, '')) || 0;
    }
  }
  return 0;
}

function parseRooms(chips: any[]): number {
  if (!chips) return 0;
  for (const chip of chips) {
    if (chip.title && chip.title.includes('اتاق')) {
      return parseInt(chip.title.replace(/[^\d]/g, '')) || 0;
    }
  }
  return 0;
}

function parseFloor(chips: any[]): number {
  if (!chips) return 0;
  for (const chip of chips) {
    if (chip.title && chip.title.includes('طبقه')) {
      return parseInt(chip.title.replace(/[^\d]/g, '')) || 0;
    }
  }
  return 0;
}

function parseBuildingAge(chips: any[]): number {
  if (!chips) return 0;
  for (const chip of chips) {
    if (chip.title && chip.title.includes('سال')) {
      return parseInt(chip.title.replace(/[^\d]/g, '')) || 0;
    }
  }
  return 0;
}

function hasFeature(chips: any[], feature: string): boolean {
  if (!chips) return false;
  return chips.some(chip => 
    chip.icon_url_light?.includes(feature) || 
    chip.icon_url_dark?.includes(feature)
  );
}

// Get polygon bounds
function getBounds(coordinates: number[][]): any {
  let minLat = Infinity, maxLat = -Infinity;
  let minLon = Infinity, maxLon = -Infinity;
  
  for (const coord of coordinates) {
    minLon = Math.min(minLon, coord[0]);
    maxLon = Math.max(maxLon, coord[0]);
    minLat = Math.min(minLat, coord[1]);
    maxLat = Math.max(maxLat, coord[1]);
  }
  
  return { minLat, maxLat, minLon, maxLon };
}

// Crawl area using Divar API
export async function crawlArea(polygon: any): Promise<any[]> {
  const bounds = getBounds(polygon.geometry.coordinates[0]);
  const divarUrl = `https://api.divar.ir/v8/postlist/w/search`;
  
  const payload = {
    "locations": {
      "rectangleSearchData": {
        "topLeft": {
          "lat": bounds.maxLat,
          "lon": bounds.minLon
        },
        "bottomRight": {
          "lat": bounds.minLat,
          "lon": bounds.maxLon
        }
      }
    },
    "categorySlug": "buy-sell",
    "subCategorySlug": "sell-apartment"
  };

  try {
    const response = await fetch(divarUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'Mozilla/5.0'
      },
      body: JSON.stringify(payload)
    });

    const data = await response.json() as any;
    
    if (data.items && data.items.post_list) {
      console.log(`✅ Found ${data.items.post_list.length} posts`);
      
      // Log first post for debugging
      if (data.items.post_list.length > 0) {
        console.log('🔍 First post full data:', JSON.stringify(data.items.post_list[0], null, 2));
      }
      
      return data.items.post_list;
    }
    
    return [];
  } catch (error) {
    console.error('Error crawling area:', error);
    throw error;
  }
}

// Fetch full details for a post
export async function fetchPostFullDetails(token: string): Promise<any> {
  try {
    const response = await fetch(`https://api.divar.ir/v5/posts/${token}`, {
      headers: {
        'User-Agent': 'Mozilla/5.0'
      }
    });
    
    const data = await response.json() as any;
    
    // Extract description and address
    let description = '';
    let address = '';
    
    if (data.sections) {
      for (const section of data.sections) {
        if (section.section_name === 'DESCRIPTION') {
          description = section.widgets?.[0]?.data?.text || '';
        }
        if (section.section_name === 'LOCATION' && section.widgets) {
          for (const widget of section.widgets) {
            if (widget.widget_type === 'TEXT_ROW' && widget.data?.value) {
              address = widget.data.value;
            }
          }
        }
      }
    }
    
    return { description, address, fullData: data };
  } catch (error) {
    console.error('Error fetching post details:', error);
    return { description: '', address: '' };
  }
}

// Process and transform post data
export async function processPost(post: any): Promise<HousePost | null> {
  try {
    const fullDetails = await fetchPostFullDetails(post.token);
    
    return {
      id: post.token || '',
      title: post.title || '',
      price: parsePrice(post.prices?.[0]?.value || post.preview_title || ''),
      pricePerMeter: parsePrice(post.prices?.[1]?.value || ''),
      area: parseArea(post.chips),
      rooms: parseRooms(post.chips), 
      floor: parseFloor(post.chips),
      buildingAge: parseBuildingAge(post.chips),
      hasElevator: hasFeature(post.chips, 'elevator'),
      hasParking: hasFeature(post.chips, 'parking'),
      hasStorage: hasFeature(post.chips, 'storage'),
      location: {
        lat: post.lat,
        lng: post.lon
      },
      description: fullDetails?.description || '',
      address: fullDetails?.address || '',
      // New fields
      imageUrls: post.images || [],
      imageCount: post.image_count || 0,
      token: post.token,
      locationType: post.location_type,
      isVerified: post.is_verified || false,
      catType: post.cat_type,
      seen: post.seen || false,
      chatEnabled: post.chat_enabled || false,
      isStockImage: post.is_stock_image || false,
      approximateLocation: post.approximate_location || false,
      subtitle1: post.subtitle1 || '',
      subtitle2: post.subtitle2 || '',
      subtitle3: post.subtitle3 || '',
      longPreviewTitle: post.long_preview_title || '',
      shortPreviewTitle: post.short_preview_title || '',
      crawledAt: new Date().toISOString(),
      rawData: post // Store full raw data for debugging
    };
  } catch (error) {
    console.error('Error processing post:', error);
    return null;
  }
} 