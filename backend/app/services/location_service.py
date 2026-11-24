from __future__ import annotations

import math
from dataclasses import dataclass

from app.core.config import Settings, settings
from app.core.errors import AppError
from app.models import AttendanceSession

EARTH_RADIUS_METERS = 6_371_000.0


@dataclass(frozen=True)
class LocationResult:
    status: str
    distance_meters: float | None
    radius_meters: float | None


def haversine_distance(latitude1: float, longitude1: float, latitude2: float, longitude2: float) -> float:
    phi1, phi2 = math.radians(latitude1), math.radians(latitude2)
    delta_phi = math.radians(latitude2 - latitude1)
    delta_lambda = math.radians(longitude2 - longitude1)
    a = (
        math.sin(delta_phi / 2) ** 2
        + math.cos(phi1) * math.cos(phi2) * math.sin(delta_lambda / 2) ** 2
    )
    return 2 * EARTH_RADIUS_METERS * math.asin(math.sqrt(a))


def effective_radius(session: AttendanceSession, config: Settings = settings) -> float:
    if session.classroom is None:
        raise AppError(422, "validation_error", "Session classroom is not configured for location checks")
    return float(session.classroom.radius_override_meters or config.allowed_classroom_radius_meters)


def verify_location(
    session: AttendanceSession,
    latitude: float | None,
    longitude: float | None,
    accuracy: float | None,
    config: Settings = settings,
) -> LocationResult:
    if not session.require_location:
        return LocationResult("not_required", None, None)

    classroom = session.classroom
    if classroom is None:
        raise AppError(422, "validation_error", "Session classroom is not configured for location checks")
    radius = effective_radius(session, config)
    if latitude is None or longitude is None:
        raise AppError(
            422,
            "validation_error",
            "Location coordinates are required for this session",
            {"location_status": "unavailable"},
        )
    if accuracy is not None and accuracy > radius * 2:
        raise AppError(
            422,
            "validation_error",
            "GPS accuracy is too low to verify classroom presence",
            {"location_status": "unavailable", "accuracy": accuracy},
        )

    distance = haversine_distance(
        latitude,
        longitude,
        float(classroom.latitude),
        float(classroom.longitude),
    )
    if distance > radius:
        raise AppError(
            403,
            "location_out_of_range",
            "You are outside the configured classroom radius",
            {
                "location_status": "out_of_range",
                "distance_meters": round(distance, 2),
                "radius_meters": radius,
            },
        )
    return LocationResult("verified", round(distance, 2), radius)
