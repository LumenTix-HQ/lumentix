export enum CoverageType {
  CANCELLATION = 'cancellation',        // Event cancellation by organiser
  WEATHER = 'weather',                  // Weather-related disruption
  LIABILITY = 'liability',              // Third-party liability
  ACCIDENT = 'accident',               // Attendee personal accident
  EQUIPMENT = 'equipment',             // Equipment / property damage
  NON_APPEARANCE = 'non_appearance',   // Speaker / performer no-show
  COMPREHENSIVE = 'comprehensive',     // All-risk bundle
}
