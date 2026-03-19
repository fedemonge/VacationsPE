import { CoordStatus } from "./types";

// Peru bounding box
const PERU = {
  latMin: -18.35,
  latMax: -0.04,
  lonMin: -81.33,
  lonMax: -68.65,
};

/**
 * Haversine distance between two points in meters
 */
export function haversineMeters(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 6371000; // Earth radius in meters
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/**
 * Check if coordinates are within Peru
 */
export function isWithinPeru(lat: number, lon: number): boolean {
  return (
    lat >= PERU.latMin &&
    lat <= PERU.latMax &&
    lon >= PERU.lonMin &&
    lon <= PERU.lonMax
  );
}

/**
 * Try to extract coordinates from an address string.
 * Handles Google Maps URLs, labeled pairs, and raw decimal pairs.
 */
export function extractCoordsFromAddress(
  address: string
): { lat: number; lon: number } | null {
  if (!address) return null;

  // Pattern 1: Google Maps @lat,lon
  const gMaps = address.match(/@(-?\d+\.?\d*),(-?\d+\.?\d*)/);
  if (gMaps) {
    const lat = parseFloat(gMaps[1]);
    const lon = parseFloat(gMaps[2]);
    if (isFinite(lat) && isFinite(lon)) return { lat, lon };
  }

  // Pattern 2: Google Maps q=lat,lon
  const gQuery = address.match(/[?&]q=(-?\d+\.?\d*),(-?\d+\.?\d*)/);
  if (gQuery) {
    const lat = parseFloat(gQuery[1]);
    const lon = parseFloat(gQuery[2]);
    if (isFinite(lat) && isFinite(lon)) return { lat, lon };
  }

  // Pattern 3: Labeled lat/lon (e.g., "lat=-12.05 lon=-77.03")
  const labeled = address.match(
    /lat[itud]*\s*[:=]\s*(-?\d+\.?\d*)[,;\s]+lon[gitud]*\s*[:=]\s*(-?\d+\.?\d*)/i
  );
  if (labeled) {
    const lat = parseFloat(labeled[1]);
    const lon = parseFloat(labeled[2]);
    if (isFinite(lat) && isFinite(lon)) return { lat, lon };
  }

  // Pattern 4: Raw decimal pair that looks like Peru coordinates
  // Match -NN.NNNN, -NN.NNNN where first is lat (-18 to 0) and second is lon (-82 to -68)
  const rawPair = address.match(
    /(-\d{1,2}\.\d{3,8})\s*[,;\s]\s*(-\d{2}\.\d{3,8})/
  );
  if (rawPair) {
    const lat = parseFloat(rawPair[1]);
    const lon = parseFloat(rawPair[2]);
    if (
      isFinite(lat) &&
      isFinite(lon) &&
      lat >= -20 &&
      lat <= 1 &&
      lon >= -82 &&
      lon <= -67
    ) {
      return { lat, lon };
    }
  }

  return null;
}

/**
 * Determine coordinate status for a task row
 */
export function determineCoordStatus(
  lat: number | null | undefined,
  lon: number | null | undefined,
  address: string | null | undefined
): {
  coordStatus: CoordStatus;
  finalLat: number | null;
  finalLon: number | null;
  extracted: boolean;
} {
  // Check if original coords are valid numbers
  if (lat != null && lon != null && isFinite(lat) && isFinite(lon)) {
    if (isWithinPeru(lat, lon)) {
      return { coordStatus: "VALID", finalLat: lat, finalLon: lon, extracted: false };
    } else {
      return { coordStatus: "OUTSIDE_PERU", finalLat: lat, finalLon: lon, extracted: false };
    }
  }

  // Try extracting from address
  if (address) {
    const extracted = extractCoordsFromAddress(address);
    if (extracted) {
      if (isWithinPeru(extracted.lat, extracted.lon)) {
        return {
          coordStatus: "EXTRACTED",
          finalLat: extracted.lat,
          finalLon: extracted.lon,
          extracted: true,
        };
      } else {
        return {
          coordStatus: "OUTSIDE_PERU",
          finalLat: extracted.lat,
          finalLon: extracted.lon,
          extracted: true,
        };
      }
    }
  }

  return { coordStatus: "MISSING", finalLat: null, finalLon: null, extracted: false };
}

/**
 * Determine if a task is "burned" (quemada)
 * Burned = unsuccessful + agent closed >500m from target
 */
export function isBurned(
  successful: boolean,
  targetLat: number | null,
  targetLon: number | null,
  closeLat: number | null,
  closeLon: number | null
): { burned: boolean; distanceMeters: number | null } {
  // Successful tasks are never burned
  if (successful) return { burned: false, distanceMeters: null };

  // Need both target and close coords
  if (
    targetLat == null ||
    targetLon == null ||
    closeLat == null ||
    closeLon == null ||
    !isFinite(targetLat) ||
    !isFinite(targetLon) ||
    !isFinite(closeLat) ||
    !isFinite(closeLon)
  ) {
    return { burned: false, distanceMeters: null };
  }

  const distance = haversineMeters(targetLat, targetLon, closeLat, closeLon);
  return { burned: distance > 500, distanceMeters: Math.round(distance) };
}
