import { type BrowserContext, test as base, expect } from "@playwright/test"
import { e2eCatalog } from "../fixtures/e2e-catalog"

const NAVER_MAP_TEST_SDK = `(()=>{class LatLng{constructor(latitude,longitude){this.latitude=latitude;this.longitude=longitude}}class Map{constructor(element){this.element=element;element.style.position='relative';element.innerHTML='<canvas data-test-naver-map width="20" height="20"></canvas>'}setCenter(){}setZoom(){}destroy(){}}class Marker{constructor(options){this.element=document.createElement('button');this.element.type='button';this.element.setAttribute('aria-label',options.title);this.element.dataset.testNaverMarker='true';this.element.dataset.latitude=String(options.position.latitude);this.element.dataset.longitude=String(options.position.longitude);this.element.style.position='absolute';this.element.style.left=String(15+((options.position.longitude-127.02)/.03)*70)+'%';this.element.style.top=String(25+((37.51-options.position.latitude)/.02)*50)+'%';this.element.textContent='핀';options.map.element.append(this.element)}setMap(map){if(map===null)this.element.remove()}}const Event={addListener(target,name,listener){if(name==='tilesloaded')queueMicrotask(listener);if(name==='click'&&target.element)target.element.addEventListener('click',listener);return{target,name,listener}},removeListener(entry){if(entry.name==='click'&&entry.target.element)entry.target.element.removeEventListener('click',entry.listener)}};window.naver={maps:{LatLng,Map,Marker,Event}}})()`

export const installMapTestRoutes = async (context: BrowserContext): Promise<void> => {
  await context.route("https://oapi.map.naver.com/**", async (route) => {
    await route.fulfill({ contentType: "text/javascript", body: NAVER_MAP_TEST_SDK })
  })
  await context.route("**/api/map-catalog", async (route) => {
    await route.fulfill({ contentType: "application/json", json: e2eCatalog })
  })
}

export const test = base.extend({
  page: async ({ context, page }, use) => {
    await installMapTestRoutes(context)
    await use(page)
  },
})

export { expect }
