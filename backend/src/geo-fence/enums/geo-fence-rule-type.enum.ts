export enum GeoFenceRuleType {
  /**
   * Restricts ticket sales to buyers located within a circular radius
   * (defined by a centre lat/lng and a radius in kilometres).
   */
  RADIUS = 'radius',

  /**
   * Restricts ticket sales to buyers whose location falls inside an
   * explicit bounding box (min/max lat + min/max lng).
   */
  BOUNDING_BOX = 'bounding_box',

  /**
   * Restricts ticket sales to buyers whose country code (ISO 3166-1 alpha-2)
   * is included in the allowed countries list.
   */
  COUNTRY_ALLOWLIST = 'country_allowlist',

  /**
   * Blocks ticket sales to buyers whose country code is in the blocked
   * countries list (deny-list / sanctions compliance).
   */
  COUNTRY_BLOCKLIST = 'country_blocklist',
}
