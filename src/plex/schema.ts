// Plex transport formats are confined to this adapter boundary.
export interface PlexPart {
  key?: string;
  container?: string;
  Stream?: { streamType?: number; codec?: string }[];
}
export interface PlexMedia {
  container?: string;
  videoCodec?: string;
  audioCodec?: string;
  indirect?: boolean | number;
  Part?: PlexPart[];
}
export interface PlexMetadata {
  ratingKey?: string | number;
  key?: string;
  type?: string;
  subtype?: string;
  extraType?: number;
  title?: string;
  summary?: string;
  year?: number;
  duration?: number;
  rating?: number;
  audienceRating?: number;
  contentRating?: string;
  Genre?: { tag?: string }[];
  thumb?: string;
  art?: string;
  viewCount?: number;
  viewOffset?: number;
  addedAt?: number;
  Media?: PlexMedia[];
  Extras?: { Metadata?: PlexMetadata[] };
}
export interface PlexContainer {
  generalDecisionCode?: number;
  transcodeDecisionCode?: number;
  friendlyName?: string;
  machineIdentifier?: string;
  version?: string;
  size?: number;
  offset?: number;
  totalSize?: number;
  Directory?: { key: string; title: string; type: string }[];
  Metadata?: PlexMetadata[];
}
