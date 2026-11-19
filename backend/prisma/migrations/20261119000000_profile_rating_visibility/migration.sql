CREATE OR REPLACE VIEW revealed_ride_ratings AS
SELECT r.booking_id, r.direction, r.score, r.review, r.created_at
FROM ride_ratings r
JOIN bookings b ON b.id = r.booking_id
WHERE b.status = 'COMPLETED'
  AND (
    (b.sponsorship_request_id IS NOT NULL AND r.direction = 'PASSENGER_TO_DRIVER')
    OR (b.sponsorship_request_id IS NULL AND EXISTS (
      SELECT 1 FROM ride_ratings other
      WHERE other.booking_id = r.booking_id AND other.direction <> r.direction
    ))
  );
