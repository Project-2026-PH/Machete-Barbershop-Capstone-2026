/**
 * Truncates a date to the start of its minute (0 seconds, 0 ms).
 * Used for standardized metric bucketing.
 */
export const getMinuteBucket = (date: Date): Date => {
  const bucket = new Date(date);
  bucket.setSeconds(0, 0);
  return bucket;
};
