export type LocationAvailability =
  | "verified"
  | "unavailable"
  | "denied"
  | "unsupported";

export interface LocationReading {
  latitude?: number;
  longitude?: number;
  accuracy?: number;
  status: LocationAvailability;
  message?: string;
}

export function isGeolocationSupported(): boolean {
  return typeof navigator !== "undefined" && "geolocation" in navigator;
}

export async function getCurrentLocation(
  options: PositionOptions = { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 },
): Promise<LocationReading> {
  if (!isGeolocationSupported()) {
    return {
      status: "unsupported",
      message: "Geolocation is not supported by this browser.",
    };
  }

  return new Promise((resolve) => {
    navigator.geolocation.getCurrentPosition(
      (position) => {
        resolve({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracy: position.coords.accuracy,
          status: "verified",
        });
      },
      (error) => {
        const denied = error.code === error.PERMISSION_DENIED;
        resolve({
          status: denied ? "denied" : "unavailable",
          message: denied
            ? "Location permission was denied. Enable location access to check in."
            : "Your location could not be determined. Try again or move closer to a window.",
        });
      },
      options,
    );
  });
}
