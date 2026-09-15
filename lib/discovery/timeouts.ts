// Include initial connection setup and cold database reads. The browser keeps its
// own 10 second budget across the request and one transient-failure retry.
export const STATE_TIMEOUT_MILLISECONDS = 3_000
export const DATA_TIMEOUT_MILLISECONDS = 3_000
export const TOTAL_TIMEOUT_MILLISECONDS = 6_500
