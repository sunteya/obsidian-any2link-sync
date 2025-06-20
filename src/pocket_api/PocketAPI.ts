import log from "loglevel";
import { Notice, request } from "obsidian";
import * as qs from "query-string";
import { PocketGetItemsResponse } from "./PocketAPITypes";
import { SupportedPlatform } from "../Types";
import { getPlatform } from "../Utils";
import { SettingsManager } from "src/SettingsManager"

export type ResponseBody = string;

export type DoHTTPRequest = (
  url: string,
  body: Record<string, string>
) => Promise<ResponseBody>;

const doRequest: DoHTTPRequest = async (url, body) => {
  return request({
    url: url,
    method: "POST",
    contentType: "application/x-www-form-urlencoded",
    body: qs.stringify(body),
  });
};

export type RequestToken = string;
export type AccessToken = string;
export type Username = string;

export type UpdateTimestamp = number;

export type AccessTokenResponse = {
  accessToken: AccessToken;
};

var storedRequestToken: RequestToken | null = null;

type ConsumerKey = string;

// From https://getpocket.com/developer/apps/
const PLATFORM_CONSUMER_KEYS: Record<SupportedPlatform, ConsumerKey> = {
  mac: "97653-12e003276f01f4288ac868c0",
  windows: "97653-541365a3736338ca19dae55a",
  linux: "97653-da7a5baf4f5172d3fce89c0a",
  ios: "98643-0f7acf0859cccd827a59d02f",
  android: "98644-7deaf66746d3a0457a1f7961",
};

const CONSUMER_KEY = PLATFORM_CONSUMER_KEYS[getPlatform()];

export type GetRequestToken = (
  authRedirectURI: string
) => Promise<RequestToken>;
export type GetAccessToken = () => Promise<AccessTokenResponse>;
export type GetPocketItems = (
  accessToken: AccessToken,
  lastUpdateTimestamp?: UpdateTimestamp,
  pocketSyncTag?: string
) => Promise<TimestampedPocketGetItemsResponse>;



export type PocketItemAction = {
  action: 'tags_add' | 'tags_remove'
  item_id: number
  tags?: string
}

export type ModifyPocketItemsResponse = {
  action_results: boolean[]
  status: number
}

export type ModifyPocketItems = (
  accessToken: AccessToken,
  actions: PocketItemAction[]
) => Promise<ModifyPocketItemsResponse>

export interface PocketAPI {
  getRequestToken: GetRequestToken;
  getAccessToken: GetAccessToken;
  getPocketItems: GetPocketItems;
  modifyPocketItems: ModifyPocketItems;
  getBaseUrl: () => string;
}

export const buildAuthorizationURL = (
  pocketAPI: PocketAPI,
  requestToken: RequestToken,
  authRedirectURI: string
) =>
  `${pocketAPI.getBaseUrl()}/auth/authorize?request_token=${requestToken}&redirect_uri=${authRedirectURI}`;

// TODO: Handle unsuccessful requests
export const getRequestToken = async (pocketAPI: PocketAPI, authRedirectURI: string) => {
  if (storedRequestToken) {
    log.warn("Found unexpected stored request token");
  }

  const REQUEST_TOKEN_URL = `${pocketAPI.getBaseUrl()}/v3/oauth/request`;

  const responseBody = await doRequest(REQUEST_TOKEN_URL, {
    consumer_key: CONSUMER_KEY,
    redirect_uri: authRedirectURI,
  });

  const formdata = await responseBody;
  const parsed = qs.parse(formdata);

  const requestToken = parsed["code"] as RequestToken;
  storedRequestToken = requestToken;
  return requestToken;
};

// TODO: Handle unsuccessful requests
export const getAccessToken = async (pocketAPI: PocketAPI) => {
  if (!storedRequestToken) {
    throw new Error("could not find stored request token");
  }

  const ACCESS_TOKEN_URL = `${pocketAPI.getBaseUrl()}/v3/oauth/authorize`;

  const responseBody = await doRequest(ACCESS_TOKEN_URL, {
    consumer_key: CONSUMER_KEY,
    code: storedRequestToken,
  });

  const formdata = await responseBody;
  const parsed = qs.parse(formdata);

  storedRequestToken = null;

  return {
    accessToken: parsed["access_token"] as AccessToken,
    username: parsed["username"] as Username,
  };
};

export type TimestampedPocketGetItemsResponse = {
  timestamp: UpdateTimestamp;
  response: PocketGetItemsResponse;
};

export const getPocketItems = async (
  pocketApi: PocketAPI,
  accessToken: AccessToken,
  lastUpdateTimestamp?: UpdateTimestamp,
  pocketSyncTag?: string
) => {
  const GET_ITEMS_URL = `${pocketApi.getBaseUrl()}/v3/get`;
  const nextTimestamp = Math.floor(Date.now() / 1000);

  const requestOptions = {
    consumer_key: CONSUMER_KEY,
    access_token: accessToken,
    since: !!lastUpdateTimestamp
      ? new Number(lastUpdateTimestamp).toString()
      : null,
    detailType: "complete",
    tag: pocketSyncTag,
  };

  if (!!lastUpdateTimestamp) {
    const humanReadable = new Date(lastUpdateTimestamp * 1000).toLocaleString();
    log.info(`Fetching with Pocket item updates since ${humanReadable}`);
  } else {
    log.info(`Fetching all Pocket items`);
  }

  try {
    const responseBody = await doRequest(GET_ITEMS_URL, requestOptions);
    log.info(`Pocket items fetched.`);
    const response = await responseBody;
    const parsedResponse = JSON.parse(response);

    return {
      timestamp: nextTimestamp,
      response: parsedResponse,
    };
  } catch (err) {
    const errorMessage = `Encountered error ${err} while fetching Pocket items`;
    log.error(errorMessage);
    new Notice(errorMessage);

    throw err;
  }
};

export const modifyPocketItems = async(
  pocketApi: PocketAPI,
  accessToken: AccessToken,
  actions: PocketItemAction[]
) => {
  const MODIFY_ITEMS_URL = `${pocketApi.getBaseUrl()}/v3/send`;

  const requestOptions = {
    consumer_key: CONSUMER_KEY,
    access_token: accessToken,
    actions: JSON.stringify(actions)
  };

  try {
    const responseBody = await doRequest(MODIFY_ITEMS_URL, requestOptions);
    log.info(`Pocket items fetched.`);
    const response = await responseBody;

    return JSON.parse(response);
  } catch (err) {
    const errorMessage = `Encountered error ${err} while modify Pocket items`;
    log.error(errorMessage);
    new Notice(errorMessage);

    throw err;
  }
}

export const buildPocketAPI = (settingsManager: SettingsManager): PocketAPI => {
  const result = <PocketAPI>{}
  result.getBaseUrl = () => settingsManager.getSetting('custom-pocket-api-url')
  result.getRequestToken = (...args) => getRequestToken(result, ...args)
  result.getAccessToken = (...args) => getAccessToken(result, ...args)
  result.getPocketItems = (...args) => getPocketItems(result, ...args)
  result.modifyPocketItems = (...args) => modifyPocketItems(result, ...args)
  return result;
};
