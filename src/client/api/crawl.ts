interface CrawlResponse {
  success: boolean;
  count: number;
  polygonId: string;
  message: string;
}

// Helper functions for localStorage
const STORAGE_PREFIX = 'melk_map_posts_';
const STORAGE_EXPIRY = 24 * 60 * 60 * 1000; // 24 hours

function saveToLocalStorage(polygonId: string, posts: any[]): void {
  try {
    const key = `${STORAGE_PREFIX}${polygonId}`;
    const data = {
      posts,
      timestamp: Date.now()
    };
    localStorage.setItem(key, JSON.stringify(data));
  } catch (error) {
    console.error('Error saving to localStorage:', error);
  }
}

function loadFromLocalStorage(polygonId: string): any[] | null {
  try {
    const key = `${STORAGE_PREFIX}${polygonId}`;
    const storedData = localStorage.getItem(key);
    
    if (!storedData) return null;
    
    const data = JSON.parse(storedData);
    const age = Date.now() - data.timestamp;
    
    // Return null if data is older than expiry time
    if (age > STORAGE_EXPIRY) {
      localStorage.removeItem(key);
      return null;
    }
    
    return data.posts;
  } catch (error) {
    console.error('Error loading from localStorage:', error);
    return null;
  }
}

export async function crawlPolygon(polygon: any, forceRefresh = false): Promise<any[]> {
  const polygonId = polygon.properties?.id || polygon.properties?.name || 'unknown';
  
  // Check localStorage first unless force refresh is requested
  if (!forceRefresh) {
    const cachedPosts = loadFromLocalStorage(polygonId);
    if (cachedPosts) {
      console.log(`📦 Loaded ${cachedPosts.length} posts from localStorage for polygon ${polygonId}`);
      return cachedPosts;
    }
  }
  
  try {
    const response = await fetch('/api/crawl', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ polygon })
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const data: CrawlResponse = await response.json();
    
    if (data.success && data.polygonId) {
      // Load posts from server
      const postsResponse = await fetch(`/api/load-posts/${data.polygonId}`);
      if (postsResponse.ok) {
        const posts = await postsResponse.json();
        
        // Save to localStorage for future use
        saveToLocalStorage(polygonId, posts);
        
        return posts;
      }
    }
    
    return [];
  } catch (error) {
    console.error('Crawl error:', error);
    throw error;
  }
}

// New function to load posts without crawling
export async function loadPostsFromFile(polygonId: string): Promise<any[]> {
  // Check localStorage first
  const cachedPosts = loadFromLocalStorage(polygonId);
  if (cachedPosts) {
    console.log(`📦 Loaded ${cachedPosts.length} posts from localStorage for polygon ${polygonId}`);
    return cachedPosts;
  }
  
  try {
    const response = await fetch(`/api/load-posts/${polygonId}`);
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    const posts = await response.json();
    
    // Save to localStorage if we got data
    if (posts.length > 0) {
      saveToLocalStorage(polygonId, posts);
    }
    
    return posts;
  } catch (error) {
    console.error('Error loading posts:', error);
    return [];
  }
}

// Function to clear cache for a specific polygon or all cached data
export function clearCache(polygonId?: string): void {
  if (polygonId) {
    localStorage.removeItem(`${STORAGE_PREFIX}${polygonId}`);
  } else {
    // Clear all cached posts
    const keys = Object.keys(localStorage);
    keys.forEach(key => {
      if (key.startsWith(STORAGE_PREFIX)) {
        localStorage.removeItem(key);
      }
    });
  }
} 