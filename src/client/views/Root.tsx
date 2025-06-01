import { useState } from "react";
import {
  fetchHouses,
  type FetchHousesFilters,
  type House,
  fetchPostDetails,
  type PostDetails
} from "@/client/api";
import { HouseDetailPanel } from "@/client/components/HouseDetailPanel";
import { useAsync } from "react-use";
import { gradientStops, HousesMap } from "@/client/components/HousesMap";
import { VscInfo, VscSettingsGear } from "react-icons/vsc";
import { HousesFilters } from "@/client/components/HousesFilters";
import { LuMagnet, LuStepBack } from "react-icons/lu";
import type { MapViewState } from "deck.gl";


export function Root() {
  const [filters, setFilters] = useState<Omit<FetchHousesFilters, 'polygon'>>({
    size: [30, 120],
    elevator: true,
    parking: true,
  });

  const [highlightedPolygon, setHighlightedPolygon] = useState<FetchHousesFilters['polygon'] | undefined>();
  const [polygon, setPolygon] = useState<FetchHousesFilters['polygon'] | undefined>();
  const [currentViewport, setCurrentViewport] = useState<MapViewState | undefined>();
  const [fixedBoundingBox, setFixedBoundingBox] = useState<{ north: number; south: number; east: number; west: number } | undefined>();

  const [progress, setProgress] = useState<number>(0);
  const [progressText, setProgressText] = useState('');
  const [houses, setHouses] = useState<House[]>([]);

  const [selectedHouse, setSelectedHouse] = useState<House | null>(null);
  const [postDetails, setPostDetails] = useState<PostDetails | null>(null);
  const [crawlTrigger, setCrawlTrigger] = useState(0); // Trigger for manual crawl
  
  // Add isCrawling state to prevent multiple crawls
  const [isCrawling, setIsCrawling] = useState(false);
  const [crawlError, setCrawlError] = useState<string | null>(null);

  const handleHouseClick = async (house: House) => {
    setSelectedHouse(house);
    setPostDetails(null); // Clear previous details
    try {
      const details = await fetchPostDetails(house.token);
      setPostDetails(details);
    } catch (error) {
      console.error("Failed to fetch post details:", error);
      // Optionally, set an error state here to show in the modal
    }
  };

  // Manual crawl function with error handling
  const handleCrawlArea = async () => {
    if (isCrawling) {
      console.log('🚫 Crawl already in progress, skipping...');
      return;
    }
    
    setIsCrawling(true);
    setCrawlError(null);
    
    try {
      // Determine which polygon to use
      let targetPolygon: GeoJSON.Polygon | undefined;
      
      if (fixedBoundingBox) {
        targetPolygon = {
          type: "Polygon",
          coordinates: [[
            [fixedBoundingBox.west, fixedBoundingBox.north],
            [fixedBoundingBox.east, fixedBoundingBox.north],
            [fixedBoundingBox.east, fixedBoundingBox.south],
            [fixedBoundingBox.west, fixedBoundingBox.south],
            [fixedBoundingBox.west, fixedBoundingBox.north]
          ]]
        };
        console.log('📦 Using fixed bounding box for crawl:', fixedBoundingBox);
      } else if (polygon) {
        targetPolygon = polygon as GeoJSON.Polygon;
        console.log('🔄 Using drawn polygon for crawl');
      } else if (currentViewport) {
        const viewportPolygon = createPolygonFromViewport(currentViewport);
        if (viewportPolygon) {
          targetPolygon = viewportPolygon;
          console.log('🗺️ Using viewport for crawl');
        }
      }
      
      if (!targetPolygon) {
        throw new Error('لطفاً ابتدا یک منطقه را انتخاب کنید یا نقشه را به موقعیت مطلوب حرکت دهید.');
      }

      const result = await fetchHouses({
        ...filters,
        polygon: targetPolygon,
      }, (p, t, c) => {
        setProgress(p);
        setProgressText(t);
        if (c && Array.isArray(c)) {
          setHouses([...c]);
        }
      });
      
      setProgress(0);
      setProgressText('');
      setHouses(result);
      
    } catch (error: any) {
      console.error('❌ Crawl failed:', error);
      setCrawlError(error.message || 'خطا در دریافت اطلاعات رخ داد');
      setProgress(0);
      setProgressText('');
    } finally {
      setIsCrawling(false);
    }
  };

  const crawlHouses = useAsync(async () => {
    if (!crawlTrigger) return [];
    
    await handleCrawlArea();
    return houses;
  }, [crawlTrigger]); // Only depend on crawlTrigger, not houses to prevent loops

  // Debug logging
  console.log('🏠 Current houses state:', houses.length, houses.slice(0, 3));

  return (
    <div className="flex h-svh w-svw relative">
      {/* Error Toast */}
      {crawlError && (
        <div className="toast toast-top toast-center z-50">
          <div className="alert alert-error">
            <span>{crawlError}</span>
            <button 
              className="btn btn-sm btn-ghost"
              onClick={() => setCrawlError(null)}
            >
              ✕
            </button>
          </div>
        </div>
      )}
      
      <div className="flex-grow h-full relative"> {/* Map container */}
        <HousesMap
          houses={houses ?? []}
          polygon={polygon}
          locked={!!polygon || isCrawling}
          onHighlightChange={setHighlightedPolygon}
          onHouseClick={handleHouseClick}
          onViewportChange={setCurrentViewport}
          showBoundingBox={true}
          boundingBox={fixedBoundingBox}
          onBoundingBoxChange={setFixedBoundingBox}
          showEmptyState={crawlTrigger > 0 && !isCrawling}
        />
        
        {/* Controls that were previously absolutely positioned might need to be reviewed,
            but the existing ones are bottom-center, so they might still work over the map.
            Let's keep them as they are for now. */}
        <div className="flex items-center justify-end backdrop-blur-sm backdrop-contrast-75 z-10 absolute bottom-2 left-1/2 -translate-x-1/2 w-xl mx-auto max-w-[calc(100svw-16px)] rounded-lg p-2 gap-2">
          <button
            onClick={() => {
              if (polygon || isCrawling || houses.length > 0) {
                setPolygon(undefined);
                setHouses([]);
                setCrawlTrigger(0); // Reset trigger
                setCrawlError(null); // Clear any errors
              } else {
                // Start crawling with fixed bounding box or current viewport
                setCrawlTrigger(prev => prev + 1);
              }
            }}
            disabled={!fixedBoundingBox && !currentViewport && !houses.length && !polygon && !isCrawling}
            className="shrink btn btn-md btn-block btn-primary"
          >
            { isCrawling && progress ? (
              <div className="flex items-center flex-col justify-between grow gap-2 w-48">
                <label htmlFor="progress-bar" className="text-xs block">{progressText || 'Loading...'}</label>
                <progress id="progress-bar" value={progress * 100} max="100" className="progress progress-primary w-full h-2" />
              </div>
            ) : (polygon || isCrawling || houses.length > 0) ? (
              <>
                <LuStepBack className="size-5" /> Reset
              </>
            ) : (
              <>
                <LuMagnet className="size-5" /> 
                {fixedBoundingBox ? 'Crawl Selected Area' : 'Crawl Viewport'}
              </>
            )}
          </button>
          <button
            onClick={()=>document.querySelector<HTMLDialogElement>('#filters-dialog')!.showModal()}
            disabled={!!polygon || isCrawling}
            className="shrink-0 btn btn-md btn-square btn-soft"
          >
            <VscSettingsGear className="size-5" />
          </button>
          <button
            onClick={()=>document.querySelector<HTMLDialogElement>('#about-dialog')!.showModal()}
            className="shrink-0 btn btn-md btn-soft btn-square"
          >
            <VscInfo className="size-5" />
          </button>
        </div>
      </div> {/* End Map container */}

      {/* Render HouseDetailPanel conditionally */}
      {selectedHouse && (
        <HouseDetailPanel
          house={selectedHouse}
          details={postDetails}
          onClose={() => {
            setSelectedHouse(null);
            setPostDetails(null);
          }}
        />
      )}

      {/* Dialogs remain outside the flex layout or at the top level of the map container if they need to overlay it */}
      <dialog id="filters-dialog" className="modal">
        <div className="modal-box">
          <h3 className="font-bold text-lg">Filters</h3>
          <div className="modal-action">
            <form method="dialog" className="w-full">
              <HousesFilters value={filters} onChange={setFilters} />
              <div className="divider" />
              <button className="btn btn-block btn-soft">Close</button>
            </form>
          </div>
        </div>
      </dialog>

      <dialog id="about-dialog" className="modal">
        <div className="modal-box">
          <h3 className="font-bold text-xl">Melk Map</h3>
          <h4 className="text-base italic mb-2 opacity-80">Real Estate Price Visualizer for All Iranian Cities</h4>
          <p className="text-sm mb-4">
            Melk Map is an <a href="https://github.com/nainemom/melk-map" target="_blank" className="link link-success">open-source</a> web app that crawls apartment listings from Divar.ir and visualizes real estate prices across all cities in Iran. Whether you're searching in Tehran, Mashhad, Isfahan, or smaller towns, Melk Map gives you a clear, data-driven view of the housing market.
          </p>
          <h3 className="font-bold text-lg mb-1">Map Legends</h3>
          <p className="text-xs italic mb-2 opacity-80">
              Note: The price ranges and color indicators are relative to the selected area only. 
              For example, a "Very Expensive" (red) property in one area search result may be in a completely 
              different price range than a "Very Expensive" property in another area search result. This helps you 
              better understand price variations within each specific region.
          </p>
          { gradientStops.map((gradientStop) => (
            <div key={gradientStop.t} className="flex items-center gap-2 mb-2 text-sm">
              <div className="rounded-full size-3" style={{ background: `rgba(${gradientStop.color.join(',')})`}}/>
              <p className="">{gradientStop.title}</p>
            </div>
          ))}
          <div className="modal-action">
            <form method="dialog" className="w-full">
              <button className="btn btn-block btn-soft">Close</button>
            </form>
          </div>
        </div>
      </dialog>

    </div> /* End flex container */
  );
}

// Helper function to create polygon from viewport
function createPolygonFromViewport(viewport: MapViewState): GeoJSON.Polygon | null {
  if (!viewport.latitude || !viewport.longitude || !viewport.zoom) return null;
  
  // Calculate viewport dimensions in degrees
  // These formulas are approximations that work reasonably well for web maps
  const metersPerPixel = 156543.03392 * Math.cos(viewport.latitude * Math.PI / 180) / Math.pow(2, viewport.zoom);
  
  // Assuming a typical viewport size (adjust based on actual container size)
  const viewportWidthPixels = window.innerWidth || 1200;
  const viewportHeightPixels = window.innerHeight || 800;
  
  const viewportWidthMeters = viewportWidthPixels * metersPerPixel;
  const viewportHeightMeters = viewportHeightPixels * metersPerPixel;
  
  // Convert meters to degrees (rough approximation)
  const metersPerDegreeLat = 111320;
  const metersPerDegreeLng = 111320 * Math.cos(viewport.latitude * Math.PI / 180);
  
  const latDelta = viewportHeightMeters / metersPerDegreeLat / 2;
  const lngDelta = viewportWidthMeters / metersPerDegreeLng / 2;
  
  const bounds = {
    north: viewport.latitude + latDelta,
    south: viewport.latitude - latDelta,
    east: viewport.longitude + lngDelta,
    west: viewport.longitude - lngDelta,
  };
  
  console.log('📍 Viewport bounds:', bounds);
  console.log(`📏 Viewport size: ${(latDelta * 2 * 111.32).toFixed(1)}km x ${(lngDelta * 2 * 111.32 * Math.cos(viewport.latitude * Math.PI / 180)).toFixed(1)}km`);
  
  return {
    type: "Polygon",
    coordinates: [[
      [bounds.west, bounds.north],
      [bounds.east, bounds.north],
      [bounds.east, bounds.south],
      [bounds.west, bounds.south],
      [bounds.west, bounds.north]
    ]]
  };
}
