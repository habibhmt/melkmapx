import { Map } from "react-map-gl/maplibre";
import DeckGL, { ScatterplotLayer, type MapViewState, GeoJsonLayer } from "deck.gl";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { type FetchHousesFilters, type House } from "@/client/api";
import { useAsync } from "react-use";
import { ofetch } from "ofetch";
import type { Feature, Geometry, MultiPolygon, Polygon } from "geojson";
import { LuMapPinCheckInside, LuMapPinXInside, LuSquare, LuX } from "react-icons/lu";
import { booleanPointInPolygon, point } from "@turf/turf";
import { PolygonLayer } from "@deck.gl/layers";

const mapStyle = "https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json";

// eslint-disable-next-line react-refresh/only-export-components
export const gradientStops: { t: number; color: [number, number, number]; title: string }[] = [
  { t: 0.0, color: [255, 255, 255], title: "0–15% (very cheap)" },
  { t: 0.15, color: [200, 255, 200], title: "15–20%" },
  { t: 0.2, color: [120, 220, 120], title: "20–35%" },
  { t: 0.35, color: [0, 180, 0], title: "35–50%" },
  { t: 0.5, color: [255, 255, 100], title: "50–65%" },
  { t: 0.65, color: [255, 180, 0], title: "65–75%" },
  { t: 0.75, color: [255, 90, 0], title: "75–88%" },
  { t: 0.88, color: [255, 0, 0], title: "88–100% (very expensive)" },
  { t: 1.0, color: [110, 0, 0], title: "Top 1–2% (extremely high-end)" },
];

export function HousesMap({
  houses,
  children,
  polygon,
  onHighlightChange,
  locked = false,
  onHouseClick,
  onViewportChange,
  showBoundingBox = false,
  boundingBox,
  onBoundingBoxChange,
  showEmptyState = false,
}: {
  houses: House[];
  children?: ReactNode;
  polygon?: FetchHousesFilters["polygon"];
  onHighlightChange?: (geometry: FetchHousesFilters["polygon"] | undefined) => void;
  locked?: boolean;
  onHouseClick?: (house: House) => void;
  onViewportChange?: (viewState: MapViewState) => void;
  showBoundingBox?: boolean;
  boundingBox?: { north: number; south: number; east: number; west: number };
  onBoundingBoxChange?: (bbox: { north: number; south: number; east: number; west: number }) => void;
  showEmptyState?: boolean;
}) {
  const geoData = useAsync(() =>
    ofetch<GeoJSON.FeatureCollection>("/geoBoundaries-IRN-ADM4_simplified.geojson", {
      responseType: "json",
    }).catch((error) => {
      console.warn('Failed to load geoBoundaries file:', error);
      // Return empty FeatureCollection to prevent errors
      return {
        type: "FeatureCollection" as const,
        features: []
      };
    })
  );

  const { min, max, data, latitude, longitude } = useMemo(() => {
    console.log('📊 Processing houses for map:', houses.length);
    
    const data = houses.filter(
      (x) =>
        typeof x.price === "number" &&
        x.location !== null &&
        typeof x.location.lat === "number" &&
        typeof x.location.lng === "number"
    );
    
    console.log('📍 Valid houses with location and price:', data.length);
    
    if (data.length === 0) {
      console.warn('⚠️ No valid houses to display!');
      return { data: [], min: 0, max: 0, latitude: undefined, longitude: undefined };
    }
    
    const sortedPrices = data.map((x) => x.price!).sort((a, b) => a - b);
    
    // Calculate percentile indices safely
    const minIndex = Math.max(0, Math.floor((sortedPrices.length - 1) * gradientStops[1].t));
    const maxIndex = Math.min(sortedPrices.length - 1, Math.floor((sortedPrices.length - 1) * gradientStops[gradientStops.length - 2].t));
    
    const min = sortedPrices[minIndex];
    const max = sortedPrices[maxIndex];
    
    console.log('💰 Price range:', { 
      min, 
      max, 
      lowest: sortedPrices[0], 
      highest: sortedPrices[sortedPrices.length - 1],
      count: sortedPrices.length 
    });
    
    return {
      data,
      min,
      max,
      longitude: data.length ? data.reduce((p, c) => p + c.location!.lng, 0) / data.length : undefined,
      latitude: data.length ? data.reduce((p, c) => p + c.location!.lat, 0) / data.length : undefined,
    };
  }, [houses]);

  const [viewState, setViewState] = useState<MapViewState>({
    latitude: 35.7129,
    longitude: 51.3847,
    zoom: 10,
  });

  // Add state for drawing mode
  const [isDrawingBBox, setIsDrawingBBox] = useState(false);
  const [drawingCorner1, setDrawingCorner1] = useState<[number, number] | null>(null);
  const [drawingCorner2, setDrawingCorner2] = useState<[number, number] | null>(null);

  useEffect(() => {
    if (latitude && longitude && !isNaN(latitude) && !isNaN(longitude)) {
      setViewState((p) => ({ ...p, latitude, longitude }));
    }
  }, [latitude, longitude]);

  // Add effect to notify parent of viewport changes
  useEffect(() => {
    onViewportChange?.(viewState);
  }, [viewState, onViewportChange]);

  const [highlightedPolygon, setHighlightedPolygon] = useState<Feature<Geometry> | undefined>();
  const highlightTimout = useRef<ReturnType<typeof setTimeout>>(setTimeout(() => null));
  
  // Re-enable the polygon highlighting feature
  useEffect(() => {
    highlightTimout.current = setTimeout(() => {
      if (locked || polygon || !geoData.value) return;
      const centerPoint = point([viewState.longitude, viewState.latitude]);
      const match = geoData.value.features.find((feature) => {
        const geometry = feature.geometry as Geometry;
        if (geometry.type !== "Polygon" && geometry.type !== "MultiPolygon") return false;
        return booleanPointInPolygon(centerPoint, feature as Feature<Polygon | MultiPolygon>);
      });
      
      setHighlightedPolygon(match ?? undefined);
      onHighlightChange?.(match ? match.geometry as never : undefined);
    }, 100);

    return () => {
      clearTimeout(highlightTimout.current);
    }
  }, [geoData.value, locked, onHighlightChange, polygon, viewState]);

  const heatLayer = new ScatterplotLayer({
    id: "house-layer",
    data,
    getPosition: (d: House) => [d.location?.lng ?? 0, d.location?.lat ?? 0],
    getRadius: () => {
      // Make radius responsive to zoom level
      const zoom = viewState.zoom;
      if (zoom < 10) return 800;
      if (zoom < 12) return 400;
      if (zoom < 14) return 200;
      if (zoom < 16) return 100;
      return 50;
    },
    radiusUnits: "meters",
    radiusMinPixels: 3,
    radiusMaxPixels: 30,
    getFillColor: (d: House) => {
      const price = d.price ?? 0;
      const t = (Math.max(min, Math.min(price, max)) - min) / (max - min);
      let color: [number, number, number] = gradientStops[gradientStops.length - 1].color;
      for (let i = 0; i < gradientStops.length - 1; i++) {
        const curr = gradientStops[i];
        const next = gradientStops[i + 1];
        if (t >= curr.t && t <= next.t) {
          const localT = (t - curr.t) / (next.t - curr.t);
          const r = Math.round(curr.color[0] + (next.color[0] - curr.color[0]) * localT);
          const g = Math.round(curr.color[1] + (next.color[1] - curr.color[1]) * localT);
          const b = Math.round(curr.color[2] + (next.color[2] - curr.color[2]) * localT);
          color = [r, g, b];
          break;
        }
      }
      return color;
    },
    onClick: ({ object }) => {
      if (onHouseClick && object) {
        onHouseClick(object as House);
      }
    },
    onHover: ({ object, x, y }) => {
      const tooltip = document.getElementById('map-tooltip');
      if (tooltip) {
        if (object) {
          const house = object as House;
          tooltip.innerHTML = `
            <div class="p-2">
              ${house.title ? `<div class="font-semibold">${house.title}</div>` : ''}
              <div class="text-sm">
                <div>Price: ${house.price?.toLocaleString()} T/m²</div>
                ${house.totalPrice ? `<div>Total: ${house.totalPrice.toLocaleString()} T</div>` : ''}
                <div>Size: ${house.size} m²</div>
                ${house.neighborhood ? `<div>${house.neighborhood}</div>` : ''}
              </div>
            </div>
          `;
          tooltip.style.display = 'block';
          tooltip.style.left = x + 'px';
          tooltip.style.top = y + 'px';
        } else {
          tooltip.style.display = 'none';
        }
      }
    },
    opacity: 0.8,
    stroked: true,
    getLineColor: [0, 0, 0],
    lineWidthMinPixels: 1,
    pickable: true,
  });

  // Re-enable geo layers
  const geoLayer = new GeoJsonLayer({
    id: "iran-admin2",
    data: geoData.value || { type: "FeatureCollection", features: [] },
    pickable: !polygon && !locked,
    stroked: !polygon && !locked,
    filled: !polygon && !locked,
    getFillColor: [255, 200, 100, 0],
    getLineColor: [80, 80, 0],
    getLineWidth: 0,
  });

  const hoverLayer = new GeoJsonLayer({
    id: "highlighted-feature", 
    data: !polygon && !locked ? highlightedPolygon : undefined,
    stroked: false,
    filled: true,
    getFillColor: [96, 93, 255, 90],
  });

  // Add bounding box layer
  const boundingBoxLayer = new PolygonLayer({
    id: "bounding-box",
    data: showBoundingBox && boundingBox ? [{
      polygon: [
        [boundingBox.west, boundingBox.north],
        [boundingBox.east, boundingBox.north],
        [boundingBox.east, boundingBox.south],
        [boundingBox.west, boundingBox.south],
        [boundingBox.west, boundingBox.north]
      ]
    }] : [],
    getPolygon: d => d.polygon,
    getFillColor: [100, 150, 250, 30],
    getLineColor: [80, 120, 250, 200],
    getLineWidth: 3,
    lineWidthMinPixels: 2,
    pickable: false,
  });

  // Add drawing preview layer
  const drawingPreviewLayer = new PolygonLayer({
    id: "drawing-preview",
    data: isDrawingBBox && drawingCorner1 && drawingCorner2 ? [{
      polygon: [
        drawingCorner1,
        [drawingCorner2[0], drawingCorner1[1]],
        drawingCorner2,
        [drawingCorner1[0], drawingCorner2[1]],
        drawingCorner1
      ]
    }] : [],
    getPolygon: d => d.polygon,
    getFillColor: [255, 200, 100, 50],
    getLineColor: [255, 150, 50, 200],
    getLineWidth: 2,
    lineWidthMinPixels: 2,
    pickable: false,
  });

  // Empty state component
  const EmptyState = () => (
    <div className="absolute inset-0 flex items-center justify-center z-20 pointer-events-none">
      <div className="bg-base-100 bg-opacity-90 backdrop-blur-sm rounded-xl p-6 text-center shadow-lg pointer-events-auto">
        <div className="text-6xl mb-4">🏠</div>
        <h3 className="text-lg font-semibold mb-2">هیچ موردی یافت نشد</h3>
        <p className="text-sm opacity-70 mb-4">
          برای محدوده انتخابی ملکی موجود نیست.<br />
          لطفاً منطقه دیگری را امتحان کنید.
        </p>
      </div>
    </div>
  );

  return (
    <DeckGL
      viewState={viewState}
      controller={true}
      onViewStateChange={({ viewState: newViewState }) => {
        setViewState(newViewState as MapViewState);
      }}
      layers={[geoLayer, hoverLayer, heatLayer, boundingBoxLayer, drawingPreviewLayer]}
      onClick={(info) => {
        if (isDrawingBBox && info.coordinate) {
          const coords: [number, number] = [info.coordinate[0], info.coordinate[1]];
          if (!drawingCorner1) {
            setDrawingCorner1(coords);
          } else {
            setDrawingCorner2(coords);
            // Create bounding box
            const bbox = {
              north: Math.max(drawingCorner1[1], coords[1]),
              south: Math.min(drawingCorner1[1], coords[1]),
              east: Math.max(drawingCorner1[0], coords[0]),
              west: Math.min(drawingCorner1[0], coords[0]),
            };
            onBoundingBoxChange?.(bbox);
            // Reset drawing state
            setIsDrawingBBox(false);
            setDrawingCorner1(null);
            setDrawingCorner2(null);
          }
        }
      }}
      onHover={(info) => {
        if (isDrawingBBox && drawingCorner1 && info.coordinate) {
          setDrawingCorner2([info.coordinate[0], info.coordinate[1]]);
        }
      }}
    >
      <Map mapStyle={mapStyle} attributionControl={false} />
      {!locked && (
        <div
          className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-full pointer-events-none z-10"
        >

          { highlightedPolygon ? <LuMapPinCheckInside className="size-10 fill-primary" /> : <LuMapPinXInside className="size-10 fill-primary" /> }
          
        </div>
      )}
      {/* Drawing mode controls */}
      {showBoundingBox && (
        <div className="absolute top-4 left-4 z-20">
          <button
            onClick={() => {
              if (isDrawingBBox) {
                // Cancel drawing
                setIsDrawingBBox(false);
                setDrawingCorner1(null);
                setDrawingCorner2(null);
              } else {
                // Start drawing
                setIsDrawingBBox(true);
                setDrawingCorner1(null);
                setDrawingCorner2(null);
              }
            }}
            className={`btn ${isDrawingBBox ? 'btn-error' : 'btn-primary'}`}
          >
            {isDrawingBBox ? (
              <>
                <LuX className="size-5" />
                Cancel Drawing
              </>
            ) : (
              <>
                <LuSquare className="size-5" />
                Draw Area
              </>
            )}
          </button>
          {isDrawingBBox && (
            <div className="mt-2 p-2 bg-base-100 rounded-lg shadow-lg">
              <p className="text-sm">
                {!drawingCorner1 
                  ? "Click to set the first corner" 
                  : "Click to set the second corner"}
              </p>
            </div>
          )}
        </div>
      )}
      {/* Clear bounding box button */}
      {showBoundingBox && boundingBox && !isDrawingBBox && (
        <div className="absolute top-4 right-4 z-20">
          <button
            onClick={() => onBoundingBoxChange?.(undefined as any)}
            className="btn btn-sm btn-ghost"
          >
            <LuX className="size-4" />
            Clear Area
          </button>
        </div>
      )}
      {/* Empty State */}
      {showEmptyState && data.length === 0 && <EmptyState />}
      {/* Tooltip */}
      <div
        id="map-tooltip"
        className="absolute bg-base-200 rounded-lg shadow-lg pointer-events-none z-10"
        style={{ display: 'none', transform: 'translate(-50%, -100%)' }}
      />
      {children}
    </DeckGL>
  );
}
