/** Paper is experimental and intentionally available only in local dev builds. */
export const ENABLE_EXPERIMENTAL_PAPER = false;

export const isPaperFeatureEnabled =
  import.meta.env.DEV && ENABLE_EXPERIMENTAL_PAPER;

/** Paper and Stage are released together behind the same experimental gate. */
export const isExperimentalChannelTypeEnabled = (type: string) =>
  type !== 'paper' && type !== 'stage' ? true : isPaperFeatureEnabled;
