/* eslint-disable @typescript-eslint/no-explicit-any */
import { toEnglishDigits } from "@/shared/utils/format";
import { generateGridOverPolygon, type BoundingBox } from "@/shared/utils/geo";
import { ofetch } from "ofetch";

const DIVAR_BASE_URL = 'https://api.divar.ir';

const apiClient = ofetch.create({
  baseURL: '/divar',
  retry: 3,
  retryDelay: 5000,
  timeout: 30000,
  headers: {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
    'Accept': 'application/json',
    'Accept-Language': 'fa,en;q=0.9',
    'Referer': 'https://divar.ir/',
  },
  onResponseError: ({ response }) => {
    console.error('API Error:', response.status, response._data);
  },
});

const divarApi = async <T>(url: string, body: any): Promise<T> => {
  const payload = btoa(JSON.stringify({
    method: 'POST',
    body: JSON.stringify(body),
  }))
  
  try {
    return await apiClient<T>(`${url}?payload=${payload}`);
  } catch (error) {
    console.error('DivarAPI request failed:', error);
    throw error;
  }
}

const divarApiGet = async <T>(url: string): Promise<T> => {
  const payload = btoa(JSON.stringify({
    method: 'GET',
    body: undefined,
  }))
  
  try {
    return await apiClient<T>(`${url}?payload=${payload}`);
  } catch (error) {
    console.error('DivarAPI GET request failed:', error);
    throw error;
  }
}

export type ProgressFn<T> = (value: number, title: string, lastData: T) => void;

export type House = {
  token: string,
  location: {
    lat: number,
    lng: number,
  },
  size: number,
  price: number, // per meter
  totalPrice?: number, // total price
  title?: string,
  subtitle?: string,
  subtitle1?: string,
  subtitle2?: string,
  subtitle3?: string,
  imageUrl?: string,
  chips?: string[], // tags like "تحویل", "پارکینگ", etc
  advertiser?: string, // "شخصی" or "آژانس املاک"
  neighborhood?: string,
  createdAt?: string,
  buildingAge?: string,
  floor?: string,
  hasElevator?: boolean,
  hasParking?: boolean,
  hasStorage?: boolean,
  roomCount?: number,
  // Additional raw data for debugging
  raw?: any,
};

export type FetchHousesFilters = {
  elevator?: boolean;
  parking?: boolean;
  balcony?: boolean;
  size?: [number, number];
  price?: [number, number];
  advertizer?: 'person' | 'business'
  polygon: GeoJSON.Polygon | GeoJSON.MultiPolygon,
}

export const fetchHouses = async (filters: FetchHousesFilters, progressFn?: ProgressFn<House[]>): Promise<House[]> => {
  let returnValue: House[] = [];

  const fetchArea = async (bbox: BoundingBox) => {
    console.log(`🔍 Fetching area with bbox:`, bbox);
    
    let viewport: any;
    try {
      viewport = await divarApi<any>('/v8/mapview/viewport', {
        search_data: {
          form_data: {
            data: {
              map_free_roaming: { boolean: { value: true } },
              category: { str: { value: "apartment-sell" } },
              ...(typeof filters.advertizer !== 'undefined' && {
                'business-type': { str: { value: filters.advertizer === 'business' ? 'real-estate-business' : 'personal' } },
              }),
              ...(typeof filters.elevator !== 'undefined' && {
                elevator: { boolean: { value: filters.elevator } },
              }),
              ...(typeof filters.parking !== 'undefined' && {
                parking: { boolean: { value: filters.parking } },
              }),
              ...(typeof filters.balcony !== 'undefined' && {
                balcony: { boolean: { value: filters.balcony } },
              }),
              ...(typeof filters.size !== 'undefined' && {
                size: {number_range: { minimum: filters.size[0], maximum: filters.size[1] }},
              }),
              ...(typeof filters.price !== 'undefined' && {
                price: {number_range: { minimum: filters.price[0], maximum: filters.price[1] }},
              }),
            }
          }
        },
        camera_info: {
          bbox: {
            min_latitude: bbox.minLat,
            min_longitude: bbox.minLng,
            max_latitude: bbox.maxLat,
            max_longitude: bbox.maxLng,
          },
          zoom: 99,
        }
      });
    } catch (error) {
      console.error('Failed to fetch viewport:', error);
      return; // Skip this bbox on error
    }

    console.log('📦 Full viewport response:', JSON.stringify(viewport, null, 2).slice(0, 2000));
    console.log(`📦 Viewport response - Posts: ${viewport?.posts?.length || 0}, Clusters: ${viewport?.clusters?.length || 0}`);
    
    // Log full response structure to understand it better
    if (!viewport) {
      console.error('❌ No viewport data received!');
      return;
    }
    
    // Log first post structure to debug
    if (viewport?.posts?.length > 0) {
      console.log('🔍 First post structure:', viewport.posts[0]);
      console.log('🔍 Map pin feature:', viewport.posts[0]?.map_pin_feature);
      console.log('🔍 Properties:', viewport.posts[0]?.map_pin_feature?.properties);
    }
    
    const hasClusters = ((viewport?.clusters ?? []).length ?? 0) > 1;
    

    if (hasClusters) {
      console.error(`❌ Area too large, has ${viewport?.clusters?.length} clusters`);
      throw new Error('Large grid size!');
    }
    
    // Log first post to see all available data
    if (viewport?.posts?.length > 0 && returnValue.length === 0) {
      console.log('🔍 First post full data:', JSON.stringify(viewport.posts[0], null, 2));
      console.log('🔍 Available chips:', viewport.posts[0]?.map_pin_feature?.properties?.properties?.chips);
    }
  
    for (const post of (viewport?.posts ?? [])) {
      const mapCard = post?.map_post_card;
      const mapPin = post?.map_pin_feature;
      const properties = mapPin?.properties?.properties || {};
      
      // Check different possible locations for coordinates
      const lat = mapPin?.lat || properties?.lat;
      const lng = mapPin?.lon || properties?.lon;
      
      console.log('📍 Checking coordinates:', { lat, lng });
      
      if (typeof lat !== 'number' || typeof lng !== 'number') {
        console.warn('⚠️ Invalid coordinates for post:', post);
        continue;
      }
  
      // Extract size from chips
      const sizeChip = (mapCard?.chips || properties?.chips || []).find((x: any) => x?.title?.includes('متر') && !x?.title?.includes('طبقه'));
      const size = sizeChip ? +toEnglishDigits(sizeChip.title).replace(/[^\d\s]/g, '') : NaN;
      
      if (Number.isNaN(size)) {
        console.warn('⚠️ Failed to extract size from:', mapCard?.chips || properties?.chips);
        continue;
      }
  
      // Extract price per meter from price_fields or subtitle2
      let price = NaN;
      
      // First try price_fields (new structure)
      const pricePerMeterField = mapCard?.price_fields?.find((field: any) => field.title === 'متری:');
      if (pricePerMeterField) {
        price = +toEnglishDigits(pricePerMeterField.value).replace(/[^\d\s]/g, '');
      }
      
      // If not found, try subtitle2 (old structure)
      if (Number.isNaN(price) && properties?.subtitle2) {
        price = +toEnglishDigits(properties.subtitle2).replace(/[^\d\s]/g, '');
      }
      
      if (Number.isNaN(price)) {
        console.warn('⚠️ Failed to extract price from:', { price_fields: mapCard?.price_fields, subtitle2: properties?.subtitle2 });
        continue;
      }
  
      const token = mapCard?.token || properties?.token;
      if (typeof token !== 'string') {
        console.warn('⚠️ No token found for post');
        continue;
      }
      if (returnValue.some(x => x.token === token)) continue;

      // Extract more data
      const title = mapCard?.title || properties?.title || '';
      const subtitle = properties?.subtitle || '';
      const subtitle1 = properties?.subtitle1 || '';
      const subtitle2 = properties?.subtitle2 || '';
      const subtitle3 = properties?.subtitle3 || '';
      
      // Extract total price
      let totalPrice = undefined;
      const totalPriceField = mapCard?.price_fields?.find((field: any) => field.title === 'قیمت:');
      if (totalPriceField) {
        totalPrice = +toEnglishDigits(totalPriceField.value).replace(/[^\d\s]/g, '') || undefined;
      } else if (subtitle1) {
        totalPrice = +toEnglishDigits(subtitle1).replace(/[^\d\s]/g, '') || undefined;
      }
      
      // Process chips
      const chipsRaw = mapCard?.chips || properties?.chips || [];
      const chips = chipsRaw.map((chip: any) => {
        if (typeof chip === 'object' && chip.title) {
          return chip.title;
        }
        return chip;
      }).filter(Boolean);
      
      const images = mapCard?.images || properties?.images || [];
      const imageUrl = images[0] || properties?.image_url || '';
      const advertiser = properties?.source ?? '';
      const neighborhood = properties?.neighborhood ?? '';
      const createdAt = properties?.created_at ?? '';
      
      // Extract additional info from chips
      const buildingAge = chips.find((chip: string) => typeof chip === 'string' && (chip.includes('ساخت') || chip.includes('سال')))?.replace(/[^\d]/g, '') || undefined;
      const floorChip = chips.find((chip: string) => typeof chip === 'string' && chip.includes('طبقه'));
      const roomCountChip = chips.find((chip: string) => typeof chip === 'string' && (chip.includes('خواب') || chip.includes('اتاق')));
      const roomCount = roomCountChip ? +toEnglishDigits(roomCountChip).replace(/[^\d]/g, '') : undefined;
      
      // Extract boolean features from chips - check if they have icons (means feature is missing)
      let hasElevator = true;
      let hasParking = true;
      let hasStorage = true;
      
      // If chips have icon_url_light/dark, it means the feature is NOT available
      chipsRaw.forEach((chip: any) => {
        if ((chip.icon_url_light?.includes('elevator') || chip.icon_url_dark?.includes('elevator')) && !chip.title) {
          hasElevator = false;
        }
        if ((chip.icon_url_light?.includes('parking') || chip.icon_url_dark?.includes('parking')) && !chip.title) {
          hasParking = false;
        }
        if ((chip.icon_url_light?.includes('storage') || chip.icon_url_dark?.includes('storage')) && !chip.title) {
          hasStorage = false;
        }
      });

      // Use all available data
      const fullRawData = {
        map_post_card: mapCard,
        map_pin_feature: mapPin,
        ...properties,
      };

      const houseData = {
        token,
        price,
        size,
        location: {
          lat,
          lng,
        },
        totalPrice,
        title,
        subtitle,
        subtitle1,
        subtitle2,
        subtitle3,
        imageUrl,
        chips,
        advertiser,
        neighborhood,
        createdAt,
        buildingAge,
        floor: floorChip,
        hasElevator,
        hasParking,
        hasStorage,
        roomCount,
        raw: fullRawData, // Store full raw data for debugging
      };
      
      console.log('✅ Extracted house:', { token, price, size, title: title.slice(0, 30), lat, lng });
      
      returnValue = [...returnValue, houseData];
    }
  }

  const bboxes = generateGridOverPolygon(filters.polygon, 1);

  progressFn?.(0, 'Start fetching...', returnValue);
  
  console.log(`📊 Total bounding boxes to fetch: ${bboxes.length}`);

  let currentBboxNum = 1;
  for (const bbpx of bboxes) {
    const prevCount = returnValue.length;
    progressFn?.(currentBboxNum / bboxes.length, `Fetching ${currentBboxNum}/${bboxes.length} bounding boxes...`, returnValue);
    
    try {
      await fetchArea(bbpx);
      const newCount = returnValue.length - prevCount;
      console.log(`✅ Bbox ${currentBboxNum}/${bboxes.length} fetched. Added ${newCount} houses. Total: ${returnValue.length}`);
    } catch (error) {
      console.error(`❌ Error fetching bbox ${currentBboxNum}:`, error);
      // Continue with next bbox instead of stopping
    }
    
    currentBboxNum += 1;
  }

  console.log(`🏁 Fetch complete! Total houses found: ${returnValue.length}`);
  
  // Send final progress update
  progressFn?.(1, `Completed! Found ${returnValue.length} houses`, returnValue);

  // Save data to localStorage and create download link
  try {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `houses-${timestamp}.json`;
    const dataToSave = {
      timestamp: new Date().toISOString(),
      filters,
      totalHouses: returnValue.length,
      houses: returnValue,
      priceRange: returnValue.length > 0 ? {
        min: Math.min(...returnValue.map(h => h.price)),
        max: Math.max(...returnValue.map(h => h.price)),
        avg: returnValue.reduce((sum, h) => sum + h.price, 0) / returnValue.length
      } : null,
      sizeRange: returnValue.length > 0 ? {
        min: Math.min(...returnValue.map(h => h.size)),
        max: Math.max(...returnValue.map(h => h.size)),
        avg: returnValue.reduce((sum, h) => sum + h.size, 0) / returnValue.length
      } : null,
      locationBounds: returnValue.length > 0 ? {
        minLat: Math.min(...returnValue.map(h => h.location.lat)),
        maxLat: Math.max(...returnValue.map(h => h.location.lat)),
        minLng: Math.min(...returnValue.map(h => h.location.lng)),
        maxLng: Math.max(...returnValue.map(h => h.location.lng))
      } : null
    };
    
    console.log('📁 Saving data...');
    console.log('Data summary:', {
      totalHouses: dataToSave.totalHouses,
      priceRange: dataToSave.priceRange,
      sizeRange: dataToSave.sizeRange,
      locationBounds: dataToSave.locationBounds
    });
    
    // Save to localStorage with fixed key and size check
    const jsonString = JSON.stringify(dataToSave);
    const sizeInMB = new Blob([jsonString]).size / (1024 * 1024);
    
    console.log(`📊 Data size: ${sizeInMB.toFixed(2)} MB`);
    
    if (sizeInMB > 2) {
      console.warn('⚠️ Data size is large:', sizeInMB.toFixed(2), 'MB - skipping localStorage save');
    } else {
      try {
        // Use fixed key instead of timestamp to avoid accumulating data
        const STORAGE_KEY = 'melk_map_last_result';
        localStorage.setItem(STORAGE_KEY, jsonString);
        console.log('✅ Data saved to localStorage successfully');
      } catch (storageError: any) {
        if (storageError.name === 'QuotaExceededError') {
          console.error('❌ حافظه مرورگر پر شده است. لطفاً نتایج قبلی را پاک کنید.');
          
          // Try to clear old data and retry
          try {
            // Clear old timestamp-based entries
            const keysToDelete: string[] = [];
            for (let i = 0; i < localStorage.length; i++) {
              const key = localStorage.key(i);
              if (key && key.startsWith('melk-map-houses-')) {
                keysToDelete.push(key);
              }
            }
            
            keysToDelete.forEach(key => localStorage.removeItem(key));
            console.log(`🧹 Cleared ${keysToDelete.length} old entries`);
            
            // Retry save
            localStorage.setItem('melk_map_last_result', jsonString);
            console.log('✅ Data saved to localStorage after cleanup');
          } catch (retryError) {
            console.error('❌ Failed to save even after cleanup:', retryError);
          }
        } else {
          console.error('❌ Failed to save to localStorage:', storageError);
        }
      }
    }
    
    // Create downloadable link only if there are results
    if (returnValue.length > 0) {
      const blob = new Blob([JSON.stringify(dataToSave, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
      console.log('📥 Download started for results file');
    }
    
  } catch (error) {
    console.error('Failed to save data:', error);
  }

  return returnValue;
}

export type PostDetails = {
  sections?: Array<{
    section_name?: string;
    widgets?: Array<{
      widget_type?: string;
      data?: any; // Data can be diverse, specific parsing will be needed later
    }>;
  }>;
};

export const fetchPostDetails = async (token: string): Promise<PostDetails | null> => {
  try {
    // Try v5 API first (which is used in crawl.ts)
    const response = await divarApiGet<any>(`/v5/posts/${token}`);
    
    console.log(`✅ Fetched details for token ${token}:`, response);
    
    // Transform v5 response to PostDetails format if needed
    if (response?.sections) {
      return response as PostDetails;
    }
    
    // If response is not in expected format, return null
    return null;
    
  } catch (error: any) {
    // If it's a 403 error, try without API call (just return null)
    if (error?.response?.status === 403) {
      console.warn(`Got 403 for token ${token}, skipping details fetch`);
      return null;
    }
    
    console.error(`Error fetching post details for token ${token}:`, error);
    return null;
  }
};