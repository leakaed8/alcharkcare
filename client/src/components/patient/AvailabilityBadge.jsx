// Availability is always shown as a color AND a text label together --
// never color alone -- per the accessibility requirement.
export default function AvailabilityBadge({ availability }) {
  if (!availability) return null;
  return <span className={`p-availability p-availability--${availability.level}`}>{availability.label}</span>;
}
