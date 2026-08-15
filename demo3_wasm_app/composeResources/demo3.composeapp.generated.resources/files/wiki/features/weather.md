---
type: feature
title: Weather
description: 'Full-featured weather display: fetches current conditions, hourly and
  10-day forecasts, air quality, and UV from Open-Meteo; renders a rich card with
  Lottie animated icons shown on the Daily screen.'
sources: [Applications/Demo3/composeApp/src/commonMain/kotlin/com/otiasj/features/weather/]
tags: [demo3, feature, weather]
timestamp: '2026-06-19T00:00:00Z'
last_commit: efd61c16658e04ccfe78c84efacd17d67c35d241
category: feature
---

# Weather

## Purpose
Full-featured weather display: fetches current conditions, hourly and 10-day forecasts, air quality, and UV from Open-Meteo; renders a rich card with Lottie animated icons shown on the Daily screen. User can pick any city or use device GPS location.

Location: `features/weather/`

## Responsibility

Owns the full weather data pipeline, geocoding, location persistence, and UI. Fetches weather from the Open-Meteo free API for a user-selected location and exposes it via `StateFlow`-backed ViewModel. Does NOT own the Daily screen — it is consumed by `features/habits/ui/DailyScreen`.

**Owns:** location selection (city search via Open-Meteo geocoding + reverse geocoding via BigDataCloud), weather fetching, location persistence via `LocalDataSource`, all weather UI composables, Lottie weather animations.

**Does NOT own:** GPS permission request (delegates to `platform/location`), the Daily screen layout.

## Key Types

| Type | Description |
|------|-------------|
| `WeatherComponent` | DI component; wires HTTP client → data sources → repositories → `WeatherViewModel` |
| `WeatherViewModel` | `androidx.lifecycle.ViewModel`; exposes `uiState: StateFlow<WeatherUiState>` + `citySearchState: StateFlow<CitySearchState>`; entry points: `loadWeather()`, `searchCity()`, `selectCity()`, `changeCity()`, `setDeviceLocation()` |
| `WeatherUiState` | Sealed class: `CityNotSet`, `Loading`, `Success(weather)`, `Error(message)` |
| `CitySearchState` | Sealed class: `Idle`, `Searching`, `Results(cities)`, `Empty(query)` |
| `Weather` | Domain model: `temperature`, `description`, `location`, `weatherCode`, `iconCode`, `highTemp`, `lowTemp`, `sunsetTime`, `uvIndex`, `humidity`, `visibilityKm`, `airQualityIndex`, `windSpeedKmh`, `windGustKmh`, `hourlyForecast: List<HourlyWeather>`, `dailyForecast: List<DailyWeather>` |
| `HourlyWeather` | `time`, `temperature`, `weatherCode`, `precipitationProbability`, `isNow` |
| `DailyWeather` | `dayOfWeek`, `weatherCode`, `highTemp`, `lowTemp`, `precipitationProbability`, `windSpeedMaxKmh`, `windGustMaxKmh` |
| `WeatherLocation` | `latitude`, `longitude`, `displayName` — selected city |
| `WeatherRepository` | Interface: `suspend getWeather(lat, lon, displayName): Result<Weather>` |
| `WeatherDataSource` | Interface: `suspend fetchWeather(lat, lon, displayName): Weather` |
| `OpenMeteoDataSource` | Calls Open-Meteo forecast + air quality APIs with dynamic coordinates. Fetches hourly/daily/current data + AQI (european_aqi from `air-quality-api.open-meteo.com`). Maps WMO codes to descriptions. |
| `WeatherLocationRepository` | Interface: `getSavedLocation(): WeatherLocation?`, `saveLocation(location)`, `suspend searchLocation(query): List<WeatherLocation>`, `suspend reverseLookup(lat, lon): String?` |
| `WeatherLocationRepositoryImpl` | Persists selected location via `LocalDataSource` (JSON-serialized); delegates search and reverse-geocoding to `GeocodingDataSource` |
| `GeocodingDataSource` | Two ops: `search(query)` → city list via Open-Meteo Geocoding API; `reverseLookup(lat, lon)` → display name via BigDataCloud reverse-geocode |
| `MockWeatherDataSource` | In-memory stub for tests/previews |

## Architecture

```
features/weather/
├── WeatherComponent.kt                   # DI: wires all layers
├── data/
│   ├── datasource/
│   │   ├── WeatherDataSource.kt          # Interface
│   │   ├── MockWeatherDataSource.kt      # Test/preview stub
│   │   └── remote/
│   │       ├── GeocodingDataSource.kt    # City search + reverse geocode
│   │       ├── GeocodingResponse.kt      # Geocoding API DTOs
│   │       ├── OpenMeteoDataSource.kt    # Forecast + AQI HTTP calls
│   │       └── OpenMeteoResponse.kt      # Serializable response DTOs
│   └── repository/
│       ├── WeatherLocationRepository.kt  # Interface (location persistence)
│       ├── WeatherLocationRepositoryImpl.kt
│       └── WeatherRepositoryImpl.kt      # safeCall wrapper
├── domain/
│   ├── model/
│   │   ├── Weather.kt                    # Full domain model (hourly + daily + AQI)
│   │   └── WeatherLocation.kt            # lat/lon + displayName
│   └── repository/
│       └── WeatherRepository.kt          # Interface
└── ui/
    ├── WeatherViewModel.kt               # StateFlow<WeatherUiState> + CitySearchState
    └── components/
        ├── WeatherWidget.kt              # Main card composable
        ├── WeatherHeroCard.kt            # Large current-conditions card
        ├── HourlyForecastRow.kt          # Horizontal hourly strip
        ├── TenDayForecastList.kt         # 10-day forecast list
        ├── AirQualityUvCards.kt          # AQI + UV index cards
        ├── EnvironmentalMetrics.kt       # Humidity, visibility, wind speed + gust status
        ├── CityPickerWidget.kt           # City search input + results list
        └── WeatherIconUtils.kt           # WMO code → Lottie animation mapping
```

## Open-Meteo Integration

`OpenMeteoDataSource` calls two endpoints:

```
GET https://api.open-meteo.com/v1/forecast
  ?latitude={lat}&longitude={lon}
  &current=temperature_2m,weather_code,relative_humidity_2m,visibility,wind_speed_10m,wind_gusts_10m
  &hourly=temperature_2m,weather_code,precipitation_probability
  &daily=weather_code,temperature_2m_max,temperature_2m_min,sunset,uv_index_max,precipitation_probability_max,wind_speed_10m_max,wind_gusts_10m_max
  &forecast_days=10
  &timezone=auto

GET https://air-quality-api.open-meteo.com/v1/air-quality
  ?latitude={lat}&longitude={lon}
  &current=european_aqi
```

AQI fetch failures are silently ignored (returns 0).

## Geocoding

`GeocodingDataSource` wraps two external services:

- **City search:** `https://geocoding-api.open-meteo.com/v1/search?name={query}&count=5` — returns up to 5 `WeatherLocation` results with `"City, Region, Country"` labels.
- **Reverse geocode:** `https://api.bigdatacloud.net/data/reverse-geocode-client?latitude={lat}&longitude={lon}&localityLanguage=en` — returns city + country string for device-location use.

## Location Flow

On `loadWeather()` the ViewModel checks `WeatherLocationRepository.getSavedLocation()`:
- If `null` → emits `WeatherUiState.CityNotSet`, surfacing the `CityPickerWidget`.
- If set → fetches weather for the saved location.

`selectCity(location)` saves the location and triggers a weather fetch. `changeCity()` returns to `CityNotSet` without clearing the saved location (allows cancel). `setDeviceLocation(lat, lon)` reverse-geocodes and calls `selectCity`.

## Weather Icons (Lottie)

`WeatherIconUtils` maps WMO weather codes to Lottie animation files bundled at `composeResources/files/lottie/`. Current set: `clear-day`, `partly-cloudy-day`, `overcast-day`, `drizzle`, `overcast-day-drizzle`, `overcast-rain`, `rain`, `overcast-day-sleet`, `snow`, `overcast-day-snow`, `overcast-day-hail`, `fog-day`, `thunderstorms-rain`. Falls back to a static icon for unmapped codes.

## WeatherViewModel States

| State | Trigger |
|---|---|
| `CityNotSet` | No saved location on `loadWeather()` |
| `Loading` | Fetch in progress |
| `Success(weather)` | Successful API response; `weather` carries full hourly+daily+AQI data |
| `Error(message)` | Network/parse failure |

City search is tracked separately via `citySearchState`:

| State | Trigger |
|---|---|
| `Idle` | Query blank or search dismissed |
| `Searching` | Geocoding request in-flight |
| `Results(cities)` | Non-empty geocoding response |
| `Empty(query)` | Geocoding returned 0 results |

## Integration with Daily Screen

`WeatherComponent` is registered by `DailyPlugin` in the app shell. `DailyScreen` takes an optional `weatherViewModel: WeatherViewModel?`; when non-null it collects both state flows. On `CityNotSet` it shows `CityPickerWidget`; on `Success` it shows `WeatherWidget`. A `LaunchedEffect(Unit)` in `dailyScreenRoute` calls `weatherViewModel.loadWeather()`.

## Dependencies

- **Core**: `LoggingHttpClient`, `createLocalDataSource`, `DiProvider`
- **Platform**: `platform/location` (`LocationRequester`) for device GPS
- **Features consuming this**: `features/habits` (DailyScreen + DailyPlugin)
- No cross-feature imports from other feature modules.

## Tests (`commonTest`)

| Test file | Coverage |
|---|---|
| `OpenMeteoDataSourceTest.kt` | WMO code mapping, Open-Meteo response parsing |
| `WeatherRepositoryImplTest.kt` | `safeCall` error propagation, domain model mapping |
| `data/repository/FakeWeatherRepository.kt` | In-memory stub implementing `WeatherRepository` for test isolation. |
| `data/repository/FakeWeatherLocationRepository.kt` | In-memory stub implementing `WeatherLocationRepository`; supports configurable search results and saved location. |
| `data/repository/WeatherLocationRepositoryImplTest.kt` | `WeatherLocationRepositoryImpl`: location persistence round-trip, search delegation, reverse-lookup. |
| `ui/WeatherViewModelTest.kt` | `WeatherViewModel` state transitions: `CityNotSet → Loading → Success`, `Error` path, city search results, `selectCity` flow. |

## Known Issues / Drift

- **`WeatherViewModel` does not extend core `ViewModel<T>`**: Uses `androidx.lifecycle.ViewModel` directly, bypassing the project's analytics and offline-state base class.
- Location is persisted as raw JSON in `LocalDataSource` — not using a typed `FakeLocalDataSource` in tests yet.

## See Also

- [habits](habits.md) — the Daily screen that embeds `WeatherWidget`
- [demo3-platform.md](../platform.md) — `LocationRequester` platform interface
- [demo3-app-shell.md](../app-shell.md) — `DailyPlugin` that registers `WeatherComponent`

_Last updated: 2026-07-03 — UI debt pass: `WeatherHeroCard` split into `WeatherHeroCard` + `WeatherAiSummary` to fix oversized-composable lint. `WeatherWidget`, `HourlyForecastRow`, `TenDayForecastList`, `CityPickerWidget` received `ThemePreviews` and had hardcoded strings extracted to resources. No logic changes._
_Previous: 2026-06-21 — Wind data added: `Weather.windSpeedKmh`/`windGustKmh` and `DailyWeather.windSpeedMaxKmh`/`windGustMaxKmh` fields added to domain model. `OpenMeteoDataSource` now requests `wind_speed_10m` and `wind_gusts_10m` for current conditions and `wind_speed_10m_max`/`wind_gusts_10m_max` in the daily forecast. `EnvironmentalMetrics` composable now shows a third panel (wind speed km/h + gust-based calm/breezy/windy status). Hourly sky color palette updated: night colour deepened, sunset changed to orange; weather-condition blending (clear/cloudy/overcast/rainy/snowy) now modulates slot colours._
_Previous: 2026-06-03 — Comprehensive test coverage added: `FakeWeatherRepository`, `FakeWeatherLocationRepository`, `WeatherLocationRepositoryImplTest`, `WeatherViewModelTest`._
