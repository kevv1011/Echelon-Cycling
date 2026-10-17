import {demoWeather} from '../services/weatherApi.js';
export const FORECAST_REFRESH_MS=10*60*1000;
export const forecastQueryKey=(route,ride,count)=>`${route.lat}/${route.lon}/${ride.date}/${ride.time}/${count}`;
export const forecastSyncDue=(lastCheck,now,visible)=>visible&&now-lastCheck>=FORECAST_REFRESH_MS;
export function fallbackForecast(cache,key,ride,count){return cache?.key===key?{data:cache.data,source:'cached',fetchedAt:cache.at}:{data:demoWeather(ride,count),source:'demo',fetchedAt:null};}
