import type { Page } from "@playwright/test"

export const installDiscoveryStartGeolocation = async (page: Page): Promise<void> => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "geolocation", {
      configurable: true,
      value: {
        getCurrentPosition: (success: PositionCallback) =>
          success({
            coords: {
              accuracy: 20,
              altitude: null,
              altitudeAccuracy: null,
              heading: null,
              latitude: 37.57,
              longitude: 126.979,
              speed: null,
              toJSON: () => ({}),
            },
            timestamp: 0,
            toJSON: () => ({}),
          }),
      },
    })
  })
}
