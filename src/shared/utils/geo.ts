import { bbox, polygon, squareGrid, booleanIntersects } from "@turf/turf";

export type BoundingBox = {
  minLat: number;
  maxLat: number;
  minLng: number;
  maxLng: number;
};

export function generateGridOverPolygon(data: GeoJSON.Polygon | GeoJSON.MultiPolygon | null | undefined, cellSideInKm = 1): BoundingBox[] {
  // Validate input polygon
  if (!data) {
    throw new Error('No polygon selected. Please draw an area first.');
  }
  
  if (!data.coordinates || data.coordinates.length === 0) {
    throw new Error('Invalid polygon coordinates. Please draw a valid area.');
  }
  
  // Additional validation for polygon structure
  const coords = data.type === "Polygon" ? data.coordinates[0] : data.coordinates[0][0];
  if (!coords || coords.length < 3) {
    throw new Error('Polygon must have at least 3 coordinates. Please draw a complete area.');
  }
  
  console.log('✅ Valid polygon received:', { type: data.type, coordinatesLength: coords.length });

  // Convert to Turf.js polygon
  const turfPolygon = polygon(
    data.type === "Polygon" ? data.coordinates : data.coordinates[0]
  );

  // Get bounding box of the polygon
  const [minLng, minLat, maxLng, maxLat] = bbox(turfPolygon);

  // Dynamically adjust cell size based on the polygon dimensions to avoid the “0 bounding boxes” error
  const latDiffDeg = maxLat - minLat;
  const lngDiffDeg = maxLng - minLng;
  const meanLat = (minLat + maxLat) / 2;
  const heightKm = latDiffDeg * 111.32;
  const widthKm  = lngDiffDeg * 111.32 * Math.cos(meanLat * Math.PI / 180);

  let adjustedCellSide = cellSideInKm;
  const minDimKm = Math.min(widthKm, heightKm);
  if (minDimKm < adjustedCellSide) {
    // Reduce cell size so that at least a 2×2 grid fits inside the polygon
    adjustedCellSide = Math.max(minDimKm / 2, 0.1); // keep a sensible lower-bound (100 m)
    console.log(`⚠️ Polygon area is small (${widthKm.toFixed(2)}×${heightKm.toFixed(2)} km). Adjusting grid cell size to ${adjustedCellSide.toFixed(3)} km.`);
  }

  // Generate square grid over bounding box with the (possibly) adjusted cell size
  const grid = squareGrid([minLng, minLat, maxLng, maxLat], adjustedCellSide, {
    units: "kilometers",
  });

  const output: BoundingBox[] = [];

  for (const feature of grid.features) {
    // Keep only squares that intersect the polygon
    if (booleanIntersects(feature, turfPolygon)) {
      const [[lng1, lat1], , [lng2, lat2]] = feature.geometry.coordinates[0];

      output.push({
        minLat: Math.min(lat1, lat2),
        maxLat: Math.max(lat1, lat2),
        minLng: Math.min(lng1, lng2),
        maxLng: Math.max(lng1, lng2),
      });
    }
  }

  // Fallback: if no grid cells were produced (e.g., very small polygon), use the polygon bbox itself
  if (output.length === 0) {
    console.warn('⚠️ No grid cells intersected the polygon. Using polygon bounding box as single cell.');
    output.push({ minLat, maxLat, minLng, maxLng });
  }

  console.log(`📦 Generated ${output.length} bounding boxes for crawling`);
  return output;
}

export function isPolygonFeature(
  feature: GeoJSON.Feature | null | undefined
): feature is GeoJSON.Feature<GeoJSON.Polygon | GeoJSON.MultiPolygon> {
  return (
    !!feature &&
    (feature.geometry.type === "Polygon" ||
      feature.geometry.type === "MultiPolygon")
  );
}