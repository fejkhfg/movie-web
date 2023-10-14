import { conf } from "@/setup/config";

import { MWMediaMeta, MWMediaType, MWSeasonMeta } from "./types/mw";
import {
  ExternalIdMovieSearchResult,
  TMDBContentTypes,
  TMDBEpisodeShort,
  TMDBExternalIds,
  TMDBMediaResult,
  TMDBMovieData,
  TMDBMovieExternalIds,
  TMDBMovieResponse,
  TMDBMovieResult,
  TMDBSeason,
  TMDBSeasonMetaResult,
  TMDBShowData,
  TMDBShowExternalIds,
  TMDBShowResponse,
  TMDBShowResult,
} from "./types/tmdb";
import { baseRawFetch, mwFetch } from "../helpers/fetch";
const OMDBKeys = ["7add0293": [true, "7add0293"], "daf26042": [true, "daf26042"], "9148ff20": [true, "9148ff20"], "a78474de": [true, "a78474de"], "bbe78db3": [true, "bbe78db3"]}];

export function mediaTypeToTMDB(type: MWMediaType): TMDBContentTypes {
  if (type === MWMediaType.MOVIE) return "movie";
  if (type === MWMediaType.SERIES) return "show";
  throw new Error("unsupported type");
}

export function TMDBMediaToMediaType(type: string): MWMediaType {
  if (type === "movie") return MWMediaType.MOVIE;
  if (type === "show") return MWMediaType.SERIES;
  throw new Error("unsupported type");
}

export function formatTMDBMeta(
  media: TMDBMediaResult,
  season?: TMDBSeasonMetaResult
): MWMediaMeta {
  const type = TMDBMediaToMediaType(media.object_type);
  let seasons: undefined | MWSeasonMeta[];
  if (type === MWMediaType.SERIES) {
    seasons = media.seasons
      ?.sort((a, b) => a.season_number - b.season_number)
      .map(
        (v): MWSeasonMeta => ({
          title: v.title,
          id: v.id.toString(),
          number: v.season_number,
        })
      );
  }

  return {
    title: media.title,
    id: media.id.toString(),
    year: media.original_release_year?.toString(),
    poster: media.poster,
    type,
    seasons: seasons as any,
    seasonData: season
      ? ({
          id: season.id.toString(),
          number: season.season_number,
          title: season.title,
          episodes: season.episodes
            .sort((a, b) => a.episode_number - b.episode_number)
            .map((v) => ({
              id: v.id.toString(),
              number: v.episode_number,
              title: v.title,
            })),
        } as any)
      : (undefined as any),
  };
}

export function TMDBMediaToId(media: MWMediaMeta): string {
  return ["tmdb", mediaTypeToTMDB(media.type), media.id].join("-");
}

export function decodeTMDBId(
  paramId: string
): { id: string; type: MWMediaType } | null {
  const [prefix, type, id] = paramId.split("-", 3);
  if (prefix !== "tmdb") return null;
  let mediaType;
  try {
    mediaType = TMDBMediaToMediaType(type);
  } catch {
    return null;
  }
  return {
    type: mediaType,
    id,
  };
}

const baseURL = "https://api.themoviedb.org/3";

const headers = {
  accept: "application/json",
  Authorization: `Bearer ${conf().TMDB_READ_API_KEY}`,
};

async function get<T>(url: string, params?: object): Promise<T> {
  const res = await mwFetch<any>(encodeURI(url), {
    headers,
    baseURL,
    params: {
      ...params,
    },
  });
  return res;
}

export async function searchMedia(
  query: string,
  type: TMDBContentTypes
): Promise<TMDBMovieResponse | TMDBShowResponse> {
  let data;

  switch (type) {
    case "movie":
      data = await get<TMDBMovieResponse>("search/movie", {
        query,
        include_adult: false,
        language: "en-US",
        page: 1,
      });
      break;
    case "show":
      data = await get<TMDBShowResponse>("search/tv", {
        query,
        include_adult: false,
        language: "en-US",
        page: 1,
      });
      break;
    default:
      throw new Error("Invalid media type");
  }

  return data;
}

// Conditional type which for inferring the return type based on the content type
type MediaDetailReturn<T extends TMDBContentTypes> = T extends "movie"
  ? TMDBMovieData
  : T extends "show"
  ? TMDBShowData
  : never;

export function getMediaDetails<
  T extends TMDBContentTypes,
  TReturn = MediaDetailReturn<T>
>(id: string, type: T): Promise<TReturn> {
  if (type === "movie") {
    return get<TReturn>(`/movie/${id}`);
  }
  if (type === "show") {
    return get<TReturn>(`/tv/${id}`);
  }
  throw new Error("Invalid media type");
}

function formatUrl(url: string): string {
  return url.replace(/\s+/g, '-');
}

function getAPIKey(currentIndex: number): string {
  if (currentIndex > 4) {
    return OMDBKeys[0][1];
  } else {
    if (OMDBKeys[currentIndex][0] === false) {
      return getAPIKey(currentIndex+1);
    } else {
      return OMDBKeys[currentIndex][1];
    }
  }
}

function indexFromKey(key: string): number {
  for (let i = 0; i < OMDBKeys.length; i++) { 
    if (OMDBKeys[i][1] === key) {
      return i;
    }
  }

  return 0;
}

function setUsed(index: number) {
  OMDBKeys[index][0] = false;
}

function getImage<T>(url: string): Promise<T> {
  return baseRawFetch<T>(formatUrl(url));
}

export function getMediaPoster(movieName: string | null, movieReleaseDate: number | null): any {
  let poster = "";
  const apikey = getAPIKey(0);
  
  if (movieReleaseDate && movieName) {
    const fetchReq = fetch(`https://www.omdbapi.com/?apikey=${apikey}&t=${movieName}&y=${movieReleaseDate}`)
    .then((response) => { 
            return response.json().then((data) => {
                console.log(data);

                if (data.Response && data.Response === "False" && data.Error === "Request limit reached!") {
                  setUsed(indexFromKey(apikey));
                }
                return data;
            }).catch((err) => {
                console.log(err);
            }) 
        });

    fetchReq.then((data) => {
       poster = data.Poster;
    });      
    /* const promise: Promise<any> = getImage(`https://www.omdbapi.com/?apikey=daf26042&t=${movieName}&y=${movieReleaseDate}`);

    promise.then(function (e) {
        console.log(e);
        console.log(e.Title || "NO TITLE???");
        console.log(e.Poster || "NO POSTER???");
        poster = e.Poster || "";
    });

    promise.finally(function () {
        console.log("DONEEEEE");
        return poster;
    }); */

    // if (promise.PromiseState && promise.PromiseResult && promise.PromiseResult.Poster) {
    //   console.log(promise.PromiseResult);
    //   return promise.PromiseResult.Poster;
    // }
  }
  if (movieName) {
    const fetchReq = fetch(`https://www.omdbapi.com/?apikey=${getAPIKey(0)}&t=${movieName}`)
    .then((response) => { 
            return response.json().then((data) => {
                console.log(data);
                return data;
            }).catch((err) => {
                console.log(err);
            }) 
        });

    fetchReq.then((data) => {
       poster = data.Poster;
    });
    /* const promise: Promise<any> = getImage(`https://www.omdbapi.com/?apikey=daf26042&t=${movieName}`);

    promise.then(function (e) {
        console.log(e);
        console.log(e.Title || "NO TITLE???");
        console.log(e.Poster || "NO POSTER???");
        poster = e.Poster || "";
    }); 

    promise.finally(function () {
        console.log("DONEEEEE");
        return poster;
    }); */

    // if (promise.PromiseState && promise.PromiseResult && promise.PromiseResult.Poster) {
    //   console.log(promise.PromiseResult);
    //   return promise.PromiseResult.Poster;
    // }
  }

  console.log(`POSTER FOR ${movieName}: `);
  console.log(poster);
  console.log("\n\n\n");
  return poster;
}

export async function getEpisodes(
  id: string,
  season: number
): Promise<TMDBEpisodeShort[]> {
  const data = await get<TMDBSeason>(`/tv/${id}/season/${season}`);
  return data.episodes.map((e) => ({
    id: e.id,
    episode_number: e.episode_number,
    title: e.name,
  }));
}

export async function getExternalIds(
  id: string,
  type: TMDBContentTypes
): Promise<TMDBExternalIds> {
  let data;

  switch (type) {
    case "movie":
      data = await get<TMDBMovieExternalIds>(`/movie/${id}/external_ids`);
      break;
    case "show":
      data = await get<TMDBShowExternalIds>(`/tv/${id}/external_ids`);
      break;
    default:
      throw new Error("Invalid media type");
  }

  return data;
}

export async function getMovieFromExternalId(
  imdbId: string
): Promise<string | undefined> {
  const data = await get<ExternalIdMovieSearchResult>(`/find/${imdbId}`, {
    external_source: "imdb_id",
  });

  const movie = data.movie_results[0];
  if (!movie) return undefined;

  return movie.id.toString();
}

export function formatTMDBSearchResult(
  result: TMDBShowResult | TMDBMovieResult,
  mediatype: TMDBContentTypes
): TMDBMediaResult {
  const type = TMDBMediaToMediaType(mediatype);
  if (type === MWMediaType.SERIES) {
    const show = result as TMDBShowResult;
    return {
      title: show.name,
      poster: getMediaPoster(show.name, new Date(show.first_air_date).getFullYear()).Poster,
      id: show.id,
      original_release_year: new Date(show.first_air_date).getFullYear(),
      object_type: mediatype,
    };
  }
  const movie = result as TMDBMovieResult;
  console.log(getMediaPoster(movie.title, new Date(movie.release_date).getFullYear()).Poster);

  return {
    title: movie.title,
    poster: getMediaPoster(movie.title, new Date(movie.release_date).getFullYear()).Poster,
    id: movie.id,
    original_release_year: new Date(movie.release_date).getFullYear(),
    object_type: mediatype,
  };
}
