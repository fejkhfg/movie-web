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

const OMDBKeys = [[true, "7add0293"], [true, "daf26042"], [true, "9148ff20"], [true, "a78474de"], [true, "bbe78db3"]];
let currentAPIKey = OMDBKeys[0][1];
let currentAPIIndex = 0;
const cachedTMDBID: {[key: string]: string} = {}

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

function getAPIKey(currentIndex: number): string | boolean {
  if (currentIndex > 4) {
    return OMDBKeys[0][1];
  }
  if (OMDBKeys[currentIndex][0] === false) {
    currentAPIIndex = currentIndex+1
    return getAPIKey(currentIndex+1);
  }
  return OMDBKeys[currentIndex][1];
}

function indexFromKey(key: string | boolean): number {
  for (let i = 0; i < OMDBKeys.length;) { 
    if (OMDBKeys[i][1] === key) {
      return i;
    }

    i += 1;
  }

  return 0;
}

function setUsed(index: any) {
  if (!Number.isNaN(parseFloat(index)) && parseFloat(index) < 5) {
    OMDBKeys[parseFloat(index)][0] = false;
  }
}

export function getMediaPoster(id: string, imdbId: string) {
  currentAPIKey = getAPIKey(currentAPIIndex);

  if (cachedTMDBID[id]) {
    return `http://img.omdbapi.com/?apikey=${currentAPIKey}&i=${cachedTMDBID[id]}`;
  }

  if (imdbId === null || imdbId === "") {
    return "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcSCMq4cGfAmaJAYVpXFPLY57EzVip1FTMK-ETQH1aU24VD-bYx5wJ4srHFP99zAgqXBvfQ:https://upload.wikimedia.org/wikipedia/commons/thumb/6/65/No-Image-Placeholder.svg/1665px-No-Image-Placeholder.svg.png&usqp=CAU"
  }

  cachedTMDBID[id] = imdbId
  
  return `http://img.omdbapi.com/?apikey=${currentAPIKey}&i=${imdbId}`;
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
  mediatype: TMDBContentTypes,
  id: string | null,
): TMDBMediaResult {
  const type = TMDBMediaToMediaType(mediatype);
  if (type === MWMediaType.SERIES) {
    const show = result as TMDBShowResult;
    return {
      title: show.name,
      poster: getMediaPoster(show.id.toString() || "", id || ""),
      id: show.id,
      original_release_year: new Date(show.first_air_date).getFullYear(),
      object_type: mediatype,
    };
  }
  const movie = result as TMDBMovieResult;
  
  return {
        title: movie.title,
        poster: getMediaPoster(movie.id.toString() || "", id || ""),
        id: movie.id,
        original_release_year: new Date(movie.release_date).getFullYear(),
        object_type: mediatype,
    };
}
