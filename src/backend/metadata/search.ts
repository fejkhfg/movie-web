import { SimpleCache } from "@/utils/cache";

import {
  formatTMDBMeta,
  formatTMDBSearchResult,
  getMediaDetails,
  mediaTypeToTMDB,
  searchMedia,
} from "./tmdb";
import { MWMediaMeta, MWQuery } from "./types/mw";
import {
  TMDBMovieData,
} from "./types/tmdb";

const cache = new SimpleCache<MWQuery, MWMediaMeta[]>();
cache.setCompare((a, b) => {
  return a.type === b.type && a.searchQuery.trim() === b.searchQuery.trim();
});
cache.initialize();

export async function searchForMedia(query: MWQuery): Promise<MWMediaMeta[]> {
  if (cache.has(query)) return cache.get(query) as MWMediaMeta[];
  const { searchQuery, type } = query;

  const data = await searchMedia(searchQuery, mediaTypeToTMDB(type));
  const results = await Promise.all(data.results.map(async v => {
    if (mediaTypeToTMDB(type) === "movie") {
      const mediaDetails: TMDBMovieData = await getMediaDetails(v.id.toString(), mediaTypeToTMDB(type));
      const formattedResult = formatTMDBSearchResult(v, mediaTypeToTMDB(type), mediaDetails.imdb_id);
      return formatTMDBMeta(formattedResult);
    }
    
    const formattedResult = formatTMDBSearchResult(v, mediaTypeToTMDB(type), "");
    return formatTMDBMeta(formattedResult);
  }));

  cache.set(query, results, 3600); // cache results for 1 hour
  return results;
}
