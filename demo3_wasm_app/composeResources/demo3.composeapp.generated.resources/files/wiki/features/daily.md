---
type: feature
title: Daily
description: Screen for the Daily collection, hosting the weather forecast and Calisthenics panes.
sources: [Applications/Demo3/composeApp/src/commonMain/kotlin/com/otiasj/features/daily/]
tags: [demo3, feature, daily, weather, calisthenics]
timestamp: '2026-09-10T14:00:00Z'
last_commit: HEAD
category: feature
---

# Daily

## Purpose
The **Daily** route hosts the 3-tab pager (`Today` / `Pulse` / `Momentum`) that provides daily routine context: current weather forecast on tab 0, and Calisthenics exercise panes on tabs 1 and 2.

Location: `features/daily/`

## Responsibility
**Owns:** The `DailyRoute` and its scaffold (`DailyScreen`, `DailyScreenTabs`, `DailyScreenPager`), and the tab-0 `WeatherSection` composable that displays weather states.
**Does NOT own:** Weather business logic / API client (owned by `features/weather`), Calisthenics exercise logic (owned by `features/calisthenics`), or Profile (owned by `features/profile`).

## Route & Entry Point
```kotlin
@Serializable
object DailyRoute

fun NavGraphBuilder.dailyScreenRoute(
    contentPadding: PaddingValues = PaddingValues()
)
```
Registered in `DailyPlugin` (`app/plugins/DailyPlugin.kt`).

## History
Previously coupled to an incomplete `habits` feature stub (`features/habits/`). In 2026-09-10, the dead habits stub was deleted and `DailyScreen` was extracted to `com.otiasj.features.daily.ui`.
