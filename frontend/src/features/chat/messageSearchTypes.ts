import type { Ref } from 'vue';

export type HasType = 'image' | 'gif' | 'link' | 'video' | 'audio' | 'docs';
export type FilterKey = 'in' | 'from' | 'mentions' | 'hasType';

export interface SearchFilters {
  in?: string;
  from?: string;
  mentions?: string;
  hasType?: HasType;
}

export interface FilterChip {
  key: FilterKey;
  value: string;
  label: string;
}

export type UseSearchApiModeOptions = {
  authToken: Ref<string | undefined | null>;
  /** Live Echo: cookie sessions have null `authToken`; API search still works via credentials. */
  echoSessionReady: Ref<boolean>;
  selectedServerId: Ref<string | undefined | null>;
  isInDMMode: Ref<boolean>;
  echoDmThreadIds: Ref<ReadonlySet<string>>;
};
