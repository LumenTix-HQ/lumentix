/**
 * Types of dispute claims that can be filed
 */
export enum DisputeClaimType {
  /** Event was falsely described in listing */
  FALSE_DESCRIPTION = 'false_description',
  /** Event was cancelled by organizer */
  EVENT_CANCELLATION = 'event_cancellation',
  /** Services/goods not rendered as promised */
  SERVICE_NOT_RENDERED = 'service_not_rendered',
}

