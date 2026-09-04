import { type BrowserContext, test as base, expect } from "@playwright/test"
import { e2eCatalog } from "../fixtures/e2e-catalog"
import { installCatalogQueryRoutes } from "./catalog-query-fixture"

const NAVER_MAP_TEST_SDK = `(()=>{class LatLng{constructor(latitude,longitude){this.latitude=latitude;this.longitude=longitude}lat(){return this.latitude}lng(){return this.longitude}}class Map{constructor(element,options){this.element=element;this.center=options.center;this.zoom=options.zoom;this.bounds={sw:new LatLng(37.492,127.02),ne:new LatLng(37.5085,127.0445)};this.listeners={};element.style.position='relative';element.innerHTML='<canvas data-test-naver-map width="20" height="20"></canvas>';window.__healthMapTestMaps??=[];window.__healthMapTestMaps.push(this)}setCenter(center){this.center=center}setZoom(zoom){this.zoom=zoom}getCenter(){return this.center}getZoom(){return this.zoom}getBounds(){return{getSW:()=>this.bounds.sw,getNE:()=>this.bounds.ne}}setTestBounds(sw,ne){this.bounds={sw:new LatLng(sw.latitude,sw.longitude),ne:new LatLng(ne.latitude,ne.longitude)};this.center=new LatLng((sw.latitude+ne.latitude)/2,(sw.longitude+ne.longitude)/2);this.listeners.idle?.()}destroy(){}}class Marker{constructor(options){this.element=document.createElement('button');this.element.type='button';this.element.setAttribute('aria-label',options.title);this.element.dataset.testNaverMarker='true';this.element.dataset.markerIcon=options.icon??'';if(options.zIndex!==undefined){this.element.dataset.markerZIndex=String(options.zIndex);this.element.style.zIndex=String(options.zIndex)}this.element.dataset.latitude=String(options.position.latitude);this.element.dataset.longitude=String(options.position.longitude);this.element.style.position='absolute';this.element.style.left=String(15+((options.position.longitude-127.02)/.03)*70)+'%';this.element.style.top=String(25+((37.51-options.position.latitude)/.02)*50)+'%';this.element.textContent='핀';options.map.element.append(this.element)}setOptions(options){if(options.title!==undefined)this.element.setAttribute('aria-label',options.title);if(options.icon!==undefined)this.element.dataset.markerIcon=options.icon;if(options.zIndex!==undefined){this.element.dataset.markerZIndex=String(options.zIndex);this.element.style.zIndex=String(options.zIndex)}if(options.position){this.element.dataset.latitude=String(options.position.latitude);this.element.dataset.longitude=String(options.position.longitude);this.element.style.left=String(15+((options.position.longitude-127.02)/.03)*70)+'%';this.element.style.top=String(25+((37.51-options.position.latitude)/.02)*50)+'%'}}setMap(map){if(map===null)this.element.remove()}}const Event={addListener(target,name,listener){target.listeners&&(target.listeners[name]=listener);if(name==='tilesloaded')queueMicrotask(listener);if(name==='click'&&target.element)target.element.addEventListener('click',listener);return{target,name,listener}},removeListener(entry){if(entry.target.listeners)delete entry.target.listeners[entry.name];if(entry.name==='click'&&entry.target.element)entry.target.element.removeEventListener('click',entry.listener)}};window.naver={maps:{LatLng,Map,Marker,Event}}})()`

export const installMapSdkTestRoutes = async (context: BrowserContext): Promise<void> => {
  await context.route("https://oapi.map.naver.com/**", async (route) => {
    await route.fulfill({ contentType: "text/javascript", body: NAVER_MAP_TEST_SDK })
  })
}

export const installMapTestRoutes = async (context: BrowserContext): Promise<void> => {
  await installMapSdkTestRoutes(context)
  await installCatalogQueryRoutes(context)
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

export const serverTest = base.extend({
  page: async ({ context, page }, use) => {
    await installMapSdkTestRoutes(context)
    await use(page)
  },
})

export { expect }
