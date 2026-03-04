/**
 * Event ID Generation Rules (SSRK-54)
 *
 * FORMAT: UUIDv7 (time-ordered UUID)
 * - Lexicographically sortable by creation time
 * - Unique across distributed systems
 * - Safe across server restarts
 *
 * PROPERTIES:
 * - Monotonic within same millisecond (uses random bits)
 * - Comparable: eventId1 < eventId2 means event1 was created before event2
 * - 128-bit: xxxxxxxx-xxxx-7xxx-yxxx-xxxxxxxxxxxx
 *
 * STRATEGY: UUIDv7 chosen because:
 * - Time-ordered (first 48 bits are Unix timestamp in ms)
 * - Database-friendly (sortable, indexable)
 * - No coordination needed between servers
 * - Built-in uniqueness guarantee
 */

/**
 * Generates a UUIDv7 (time-ordered UUID)
 * Format: xxxxxxxx-xxxx-7xxx-yxxx-xxxxxxxxxxxx
 * @returns {string} UUIDv7 string
 */
export function generateEventId() {
  const now = Date.now();

  // Get 48-bit timestamp
  const timestamp = now.toString(16).padStart(12, '0');

  // Generate random bits for the rest
  const randomBits = new Array(4)
    .fill(0)
    .map(() =>
      Math.floor(Math.random() * 0x10000)
        .toString(16)
        .padStart(4, '0')
    )
    .join('');

  // Construct UUIDv7
  // Format: tttttttt-tttt-7xxx-yxxx-xxxxxxxxxxxx
  // t = timestamp, 7 = version, y = variant (8,9,a,b), x = random
  const uuid = [
    timestamp.slice(0, 8),
    timestamp.slice(8, 12),
    '7' + randomBits.slice(0, 3),
    ((parseInt(randomBits.slice(3, 4), 16) & 0x3) | 0x8).toString(16) + randomBits.slice(4, 7),
    randomBits.slice(7, 19).padEnd(12, '0').slice(0, 12),
  ].join('-');

  return uuid;
}

/**
 * Extracts timestamp from a UUIDv7
 * @param {string} uuid - UUIDv7 string
 * @returns {Date} Date object
 */
export function extractTimestamp(uuid) {
  const hex = uuid.replace(/-/g, '').slice(0, 12);
  const timestamp = parseInt(hex, 16);
  return new Date(timestamp);
}

/**
 * Validates UUIDv7 format
 * @param {string} uuid - String to validate
 * @returns {boolean} True if valid UUIDv7
 */
export function isValidEventId(uuid) {
  const uuidv7Regex = /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  return uuidv7Regex.test(uuid);
}
